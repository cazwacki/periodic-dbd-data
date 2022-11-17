const fetch = require('node-fetch');
const merge = require('deepmerge');
const { exec } = require('child_process');
const requireUncached = require('require-uncached');
const fs = require('fs');

const axios = require('axios');
const https = require('https');
const httpsAgent = new https.Agent({ keepAlive: true });

let urls = {
    "addons": "https://dbd.tricky.lol/api/addons",
    "shrine": "https://dbd.tricky.lol/api/shrine",
    "items": "https://dbd.tricky.lol/api/items",
    "killers": "https://dbd.tricky.lol/api/characters?role=killer",
    "perks": "https://dbd.tricky.lol/api/perks",
    "rift": "https://dbd.tricky.lol/api/rift",
    "version": "https://steam.live.bhvrdbd.com/api/v1/utils/contentVersion/version"
}

let next_shrine_fetch = 0;
let next_rift_fetch = 0;
let next_version_check = 0;

let queued_cmds = [];
let last_scan_unix;

prettyLog('Started');
performUpdate();

function performUpdate() {
    tryUpdateAll();
    setTimeout(performUpdate, 60 * 1000); // every minute
}

String.prototype.replaceAll = function (strReplace, strWith) {
    var esc = strReplace.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    var reg = new RegExp(esc, 'ig');
    return this.replace(reg, strWith);
};

async function tryUpdateAll() {

    tryPushUpdates();

    last_scan_unix = Math.floor(new Date() / 1000);

    let version_updated = false;
    if (next_version_check < last_scan_unix) {
        version_updated = tryUpdateVersion().then(() => {
            if (version_updated) {
                tryUpdatePerks();
                tryUpdateShrine(); // shrine needs new perk descriptions, if applicable
                tryUpdateItems();
                tryUpdateAddons();
                tryUpdateKillers();
            }
        });
    }

    if (next_rift_fetch < last_scan_unix) {
        await tryUpdateRift();
    }

    if (next_shrine_fetch < last_scan_unix) {
        await tryUpdateShrine();
    }

}

function tryPushUpdates() {
    // execute any needed git pushes
    if (queued_cmds.length > 0) {
        let command = queued_cmds.join('; ');
        command += '; git push';
        exec(command, (err, stdout, stderr) => {
            if (!err) {
                prettyLog('tryPushUpdates()\texecuted: "', command, '"');
                queued_cmds = [];
            } else {
                prettyLog(err);
            }
        });
    }
}

async function tryUpdateVersion() {
    let out = await fetch(urls["version"]).then(res => res.json())
        .catch(function (error) {
            prettyLog("The following error occurred while fetching version data.")
            console.log(error);
            next_version_check = last_scan_unix + 60 * 60;
            return null;
        });

    if (out == null) {
        return;
    }

    let saved_version = requireUncached('./version.json');
    let latest_version = Object.keys(out.availableVersions)
        .filter(k => !k.startsWith("m_"))
        .pop();

    if (latest_version != saved_version.latest) {
        fs.writeFile("version.json", "{\"latest\": \"" + latest_version + "\"}", (err) => {
            if (err) {
                throw err;
            } else {
                queued_cmds.push('git add version.json && git commit -m "Automated Version Update"');
                prettyLog("tryUpdateVersion()\tversion updated");
                next_version_check = last_scan_unix + 24 * 60 * 60; // next day
                return true;
            }
        });
    } else {
        prettyLog("tryUpdateVersion()\tno new version");
        next_version_check = last_scan_unix + 60 * 60;
        return false;
    }
}

async function tryUpdateShrine() {
    let out = await fetch(urls["shrine"]).then(res => res.json())
        .catch(function (error) {
            prettyLog("The following error occurred while fetching shrine data.")
            console.log(error);
            next_shrine_fetch = last_scan_unix + 60 * 60;
            return null;
        });

    if (out == null) {
        return;
    }
    let new_shrine = {};
    new_shrine["end"] = out.end;
    new_shrine["perks"] = formatShrine(out.perks);
    let new_shrine_json = JSON.stringify(new_shrine);

    let old_shrine_json = JSON.stringify(requireUncached('./shrine.json'));

    if (old_shrine_json != new_shrine_json) {
        fs.writeFile("shrine.json", new_shrine_json, (err) => {
            if (err) {
                throw err;
            } else {
                queued_cmds.push('git add shrine.json && git commit -m "Automated Shrine Update"');
                prettyLog("tryUpdateShrine() \shrine data updated and commit added to the queue");
            }
        });
    } else {
        prettyLog("tryUpdateShrine() \tno new shrine data");
        next_shrine_fetch = last_scan_unix + 60 * 60;
    }
}

async function tryUpdateRift() {
    let out = await fetch(urls["rift"]).then(res => res.json())
        .catch(function (error) {
            prettyLog("The following error occurred while fetching rift data.")
            console.log(error);
            next_rift_fetch = last_scan_unix + 60 * 60;
            return null;
        });

    if (out == null) {
        return;
    }

    let new_rift_start = out[Object.keys(out).sort().pop()].start;
    let old_rift = requireUncached('./rift.json');

    if (new_rift_start >= old_rift.end) {
        let new_rift_end = new_rift_start + 70 * 24 * 60 * 60;
        fs.writeFile("rift.json", JSON.stringify({ end: new_rift_end + 60 * 60 }), (err) => {
            if (err) {
                throw err;
            } else {
                queued_cmds.push('git add rift.json && git commit -m "Automated Rift Update"');
                prettyLog("tryUpdateRift()\trift data updated and commit added to the queue");
                next_rift_fetch = new_rift_end + 60 * 60; // 1 hour after rift is updated
                return true;
            }
        });
    } else {
        next_rift_fetch = last_scan_unix + 60 * 60;
        return false;
    }
}

async function tryUpdatePerks() {
    let out = await fetch(urls["perks"]).then(res => res.json())
        .catch(function (error) {
            console.log(error);
            return;
        });
    let new_perks = formatPerks(out);
    let new_perks_json = JSON.stringify(merge(new_perks, requireUncached('./perk_extras')));

    let old_perks_json = JSON.stringify(requireUncached('./perks.json'));

    if (old_perks_json != new_perks_json) {
        fs.writeFile("perks.json", new_perks_json, (err) => {
            if (err) {
                throw err;
            } else {
                queued_cmds.push('git add perks.json && git commit -m "Automated Perks Update"');
                prettyLog("tryUpdatePerks() \tperk data updated and commit added to the queue");
            }
        });
    } else {
        prettyLog("tryUpdatePerks() \tno new perk data");
    }
}

const findFirstDiff = (str1, str2) =>
    str2[[...str1].findIndex((el, index) => el !== str2[index])];

async function tryUpdateItems() {
    let out = await fetch(urls["items"]).then(res => res.json())
        .catch(function (error) {
            prettyLog("The following error occurred while fetching item data.")
            console.log(error);
            return null;
        });

    if (out == null) {
        return;
    }
    let new_items = formatItems(out);
    let new_items_json = JSON.stringify(merge(new_items, requireUncached('./item_extras')));

    let old_items_json = JSON.stringify('./items.json');

    if (old_items_json != new_items_json) {
        fs.writeFile("items.json", new_items_json, (err) => {
            if (err) {
                throw err;
            } else {
                queued_cmds.push('git add items.json && git commit -m "Automated Items Update"');
                prettyLog("tryUpdateItems() \titem data updated and commit added to the queue");
            }
        });
    } else {
        prettyLog("tryUpdateItems() \tno new item data");
    }
}

async function tryUpdateAddons() {
    let out = await fetch(urls["addons"]).then(res => res.json())
        .catch(function (error) {
            prettyLog("The following error occurred while fetching addon data.")
            console.log(error);
            return null;
        });

    if (out == null) {
        return;
    }
    let new_addons = await formatAddons(out);
    let new_addons_json = JSON.stringify(merge(new_addons, requireUncached('./addon_extras')));

    let old_addons_json = JSON.stringify(requireUncached('./addons.json'));

    if (old_addons_json != new_addons_json) {
        fs.writeFile("addons.json", new_addons_json, (err) => {
            if (err) {
                throw err;
            } else {
                queued_cmds.push('git add addons.json && git commit -m "Automated Addons Update"');
                prettyLog("tryUpdateAddons()\taddon data updated and commit added to the queue");
            }
        });
    } else {
        prettyLog("tryUpdateAddons()\tno new addon data");
    }
}

async function tryUpdateKillers() {
    let out = await fetch(urls["killers"]).then(res => res.json())
        .catch(function (error) {
            prettyLog("The following error occurred while fetching killer data.")
            console.log(error);
            return null;
        });

    if (out == null) {
        return;
    }

    let new_addons = formatKillers(out);
    let new_killers_json = JSON.stringify(merge(new_addons, requireUncached('./killer_extras')));

    let old_killers_json = JSON.stringify(requireUncached('./killers.json'));

    if (old_killers_json != new_killers_json) {
        fs.writeFile("killers.json", new_killers_json, (err) => {
            if (err) {
                throw err;
            } else {
                queued_cmds.push('git add killers.json && git commit -m "Automated Killers Update"');
                prettyLog("tryUpdateKillers()\tkiller data updated and commit added to the queue");
            }
        });
    } else {
        prettyLog("tryUpdateKillers()\tno new killer data");
    }
}

function formatShrine(perks) {
    let perk_data_set = requireUncached('./perks');
    perks = perks.map(function (perk) {
        let perk_name = '';
        let perk_data = '';
        for (let key of Object.keys(perk_data_set)) {
            if (perk_data_set[key].alt_name === perk.id) {
                perk_name = key;
                perk_data = perk_data_set[key];
            }
        }

        if (perk_name === '') {
            prettyLog('formatShrine()\tFailed to find the perk: ' + perk.id);
            return null;
        }

        return {
            id: perk_name,
            description: perk_data.description,
            url: perk_data.url,
            img_url: perk_data.img_url
        }
    });
    return perks;
}

function formatPerks(out) {
    let fixed_perks = '{';
    for (let key of Object.keys(out)) {
        fixed_perks += '"' + out[key].name.replaceAll('\"', '\\\"')
            .replaceAll("We'll make it", "We'll Make It")
            .replaceAll("Barbecue & Chili", "Barbecue & Chilli")
            .replaceAll("’", "'")
            .replaceAll("&nbsp;", " ")
            .replaceAll("Hex: Blood Favor", "Hex: Blood Favour")
            .replaceAll("Make your Choice", "Make Your Choice")
            .replaceAll("Play with your food", "Play with Your Food")
            .replaceAll("Save the best for last", "Save the Best for Last")
            .replaceAll("Deja Vu", "Déjà Vu")
            + '":{';

        // fix description
        let description = out[key].description.replaceAll('\"', '\\\"');
        for (let i = 0; i < out[key].tunables.length; i++) {
            let tunable = out[key].tunables[i];
            if (tunable.length == 3) {
                let colored_tunable = '<span style=\\\"color:#FFD700; font-weight: bold\\\">' + out[key].tunables[i][0] +
                    '</span>/<span style=\\\"color:#7CFC00; font-weight: bold\\\">' + out[key].tunables[i][1] +
                    '</span>/<span style=\\\"color:#CF9FFF; font-weight: bold\\\">' + out[key].tunables[i][2] + '</span>';
                description = description.replaceAll("{" + i.toString() + "}", colored_tunable);
            } else {
                description = description.replaceAll("{" + i.toString() + "}", out[key].tunables[i].join("/"));
            }
        }
        description = beautify(description);

        let alt_name = key;
        if (alt_name == "Bloodhound") {
            alt_name = "BloodHound";
        }

        fixed_perks += '"description":"' + description + '",';
        fixed_perks += '"role": "' + out[key].role + '",';
        fixed_perks += '"alt_name": "' + alt_name + '"';
        fixed_perks += "},";
    }

    fixed_perks = fixed_perks.slice(0, -1) + "}";
    return JSON.parse(fixed_perks)
}

function formatItems(out) {
    let fixed_items = '{';
    for (let key of Object.keys(out)) {
        if (out[key].name != null) {
            fixed_items += '"' + out[key].name.replaceAll('\"', '\\\"') + '":{';
            fixed_items += '"description":"' + beautify(out[key].description.replaceAll('\"', '\\\"')) + '"';
            fixed_items += "},";
        }
    }
    fixed_items = fixed_items.slice(0, -1) + "}";
    return JSON.parse(fixed_items);
}

async function formatAddons(out) {
    let fixed_addons = '{';
    for (let key of Object.keys(out)) {
        if (out[key].name != null) {
            let addon_name = out[key].name.replaceAll('”', '\"').replaceAll('“', '\"').replaceAll('\"', '\\\"').replaceAll("’", "'").replaceAll("&nbsp;", " ").trim();
            // special cases
            switch (addon_name) {
                case "Ether 15 vol%":
                    addon_name = "Ether 15 Vol%";
                    break;
                case "Emetic potion":
                    addon_name = "Emetic Potion";
                    break;
                case "Honey Locust Thorns":
                    addon_name = "Honey Locust Thorn";
                    break;
                case "Misty Day, Remains of Judgment":
                    addon_name = "Misty Day, Remains of Judgement";
                    break;
                case "High-end Sapphire lens":
                    addon_name = "High-End Sapphire Lens";
                    break;
                case "\\\"Windstorm\\\"- Mud":
                    addon_name = "\\\"Windstorm\\\" - Mud";
                    break;
                case "Waiting for You Watch":
                    addon_name = "Waiting For You Watch";
                    break;
                case "Vermillion Webcap":
                    addon_name = "Vermilion Webcap";
                    break;
                case "Rule Set No.2":
                    addon_name = "Rules Set No.2";
                    break;
                case "Tuned Carburetor":
                    addon_name = "Tuned Carburettor";
                    break;
                case "Award-Winning Chili":
                    addon_name = "Award-Winning Chilli";
                    break;
                case "Chili":
                    addon_name = "Chilli";
                    break;
                case "Rusted Chain":
                    addon_name = "Rusted Chains";
                    break;
                case "Grisly Chain":
                    addon_name = "Grisly Chains";
                    break;
                case "Granma's Heart":
                    addon_name = "Grandma's Heart";
                    break;
                case "Garish Makeup Kit":
                    addon_name = "Garish Make-up Kit";
                    break;
                case "Sulfuric Acid Vial":
                    addon_name = "Sulphuric Acid Vial";
                    break;
                case "Lo Pro Chains":
                    addon_name = "LoPro Chains";
                    break;
                case "Mew's Guts":
                    addon_name = "Mews' Guts";
                    break;
            }
            fixed_addons += '"' + addon_name + '":{';
            fixed_addons += '"description":"' + beautify(out[key].description.replaceAll('\"', '\\\"').replaceAll("&nbsp;", " ")) + '"';
            fixed_addons += "},";
        }
    }
    fixed_addons = fixed_addons.slice(0, -1) + "}";
    return JSON.parse(fixed_addons);
}

function formatKillers(out) {
    let fixed_killers = '{';
    for (let key of Object.keys(out)) {
        if (out[key].name != null) {
            fixed_killers += '"' + out[key].name.replaceAll('\"', '\\\"').replaceAll("’", "'") + '":{';
            fixed_killers += '"description":"' + out[key].bio.split(".")[0].replaceAll('\"', '\\\"') + '."';
            fixed_killers += "},";
        }
    }

    fixed_killers = fixed_killers.slice(0, -1) + "}";
    return JSON.parse(fixed_killers);
}

function beautify(description) {
    // connect multi-word terms and add proper spacing after periods
    description = description
        .replaceAll('Terror Radius', 'Terror_Radius')
        .replaceAll('Health State', 'Health_State')
        .replaceAll('Breakable Wall', 'Breakable_Wall')
        .replaceAll('Great Skill Check', 'Great_Skill_Check')
        .replaceAll('Good Skill Check', 'Good_Skill_Check')
        .replaceAll('Failed Skill Check', 'Failed_Skill_Check')
        .replaceAll('Skill Check', 'Skill_Check')
        .replaceAll('Loud Noise Notification', 'Loud_Noise_Notification')
        .replaceAll('Boon Totem', 'Boon_Totem')
        .replaceAll('Dull Totem', 'Dull_Totem')
        .replaceAll('Hex Totem', 'Hex_Totem')
        .replaceAll('Protection Hit', 'Protection_Hit')
        .replaceAll('Injured State', 'Injured_State')
        .replaceAll('Deep Wound', 'Deep_Wound')
        .replaceAll('Pools of Blood', 'Pools_of_Blood')
        .replaceAll('Dying State', 'Dying_State')
        .replaceAll('Scourge Hook', 'Scourge_Hook')
        .replaceAll('Basement Hook', 'Basement_Hook')
        .replaceAll('Scratch Marks', 'Scratch_Marks')
        .replaceAll('Exit Gate Switches', 'Exit_Gate_Switches')
        .replaceAll('Exit Gate', 'Exit_Gate')
        .replaceAll('Basic Attack', 'Basic_Attack')
        .replaceAll('Special Attack', 'Special_Attack')
        .replaceAll('Stillness Crows', 'Stillness_Crows')
        .replaceAll('%', ' %').replaceAll('&nbsp;', ' ')
        .replaceAll('<b>', '').replace(/\.([^0-9\s])/g, '. $1')
        .replaceAll('</b>', '').replaceAll("<br>", "<br> ");

    let general_keywords = ['Item',
        'Items', 'Chest', 'Chests', 'Add-on', 'Add-ons',
        'Exit_Gate', 'Exit_Gates', 'Aura', 'Auras', 'Pallet',
        'Pallets', 'Breakable_Wall', 'Breakable_Walls',
        'Generator', 'Generators', 'Skill_Check', 'Skill_Checks',
        'Survivor', 'Survivors', 'Med-Kit', 'Boon_Totem',
        'Boon_Totems', 'Locker', 'Lockers', 'Totem', 'Totems',
        'Dull_Totem', 'Dull_Totems', 'Hex_Totem', 'Hex_Totems',
        'Good_Skill_Check', 'Good_Skill_Checks', 'Great_Skill_Check',
        'Great_Skill_Checks', 'Hatch', 'Window', 'Windows',
        'Map', 'Maps', 'Altruism', 'Bloodpoints', 'Flashlight',
        'Toolbox', 'Med-Kits', 'Basic_Attack', 'Basic_Attacks',
        'Special_Attack', 'Special_Attacks', 'Luck',
        'Exit_Gate_Switch', 'Exit_Gate_Switches', 'Protection_Hit',
        'Protection_Hits', 'Hunter', 'Entity', 'Deviousness',
        'Failed_Skill_Check', 'Failed_Skill_Checks', 'Basement',
    ];
    let states = ['Health_State', 'Health_States', 'Injured_State', 'Injured_States', 'Dying_State', 'Dying_States'];
    let good_status_effects = ['Haste', 'Endurance', 'Bloodlust', 'Undetectable'];
    let bad_status_effects = ['Exhaustion', 'Exhausted', 'Broken', 'Bleeding', 'Blindness',
        'Deep Wound', 'Cursed', 'Exposed', 'Hindered', 'Oblivious',
        'Hemorrhage', 'Incapacitated', 'Mangled'];
    let killer_keywords = ['Hook', 'Hooks', 'Loud_Noise_Notification',
        'Loud_Noise_Notifications', 'Obsession', 'Killer', 'Killers',
        'Scratch_Mark', 'Scratch_Marks', 'Crows', 'Pools_of_Blood',
        'Terror Radius', 'Stillness_Crows', 'Scourge_Hook', 'Scourge_Hooks',
        'Basement_Hook', 'Basement_Hooks'];
    let color_counter = ['Token', 'Tokens', 'second', 'seconds', 'meter', 'meters', '%', 'charges'];

    let split_desc = description.split(/\s+/);
    for (let i = 0; i < split_desc.length; i++) {
        let color = '';
        let term = split_desc[i].replaceAll('.', '').replaceAll(',', '').toLowerCase();
        if (general_keywords.find(element => { return element.toLowerCase() === term; }) !== undefined) {
            color = '#FFD700';
        } else if (states.find(element => { return element.toLowerCase() === term; }) !== undefined) {
            color = '#008080';
        } else if (good_status_effects.find(element => { return element.toLowerCase() === term; }) !== undefined) {
            color = '#7CFC00';
        } else if (bad_status_effects.find(element => { return element.toLowerCase() === term; }) !== undefined) {
            color = '#D2042D';
        } else if (killer_keywords.find(element => { return element.toLowerCase() === term; }) !== undefined) {
            color = '#CF9FFF';
        } else if (color_counter.find(element => { return element.toLowerCase() === term; }) !== undefined) {
            color = '#FFA500';
        }

        if (color != '') {
            if (color == "#FFA500" && !isNaN(split_desc[i - 1])) {
                split_desc[i - 1] = '<span style=\\\"color:' + color + '; font-weight: bold\\\">' + split_desc[i - 1];
                split_desc[i] = split_desc[i] + '</span>';
            } else {
                split_desc[i] = '<span style=\\\"color:' + color + '; font-weight: bold\\\">' + split_desc[i] + '</span>';
            }
        }
    }

    description = split_desc.join(" ").replaceAll(" %", "%");

    // disconnect multi-word terms
    description = description.replaceAll("_", " ");
    return description;
}

function prettyLog(message) {
    let dateString = new Date().toISOString();
    console.log('[' + dateString.replaceAll('T', ' ').split('.')[0] + ']:', message);
}

function isEqual(obj1, obj2) {
    var props1 = Object.getOwnPropertyNames(obj1);
    var props2 = Object.getOwnPropertyNames(obj2);
    if (props1.length != props2.length) {
        return false;
    }
    for (var i = 0; i < props1.length; i++) {
        let val1 = obj1[props1[i]];
        let val2 = obj2[props1[i]];
        let isObjects = isObject(val1) && isObject(val2);
        if (isObjects && !isEqual(val1, val2) || !isObjects && val1 !== val2) {
            return false;
        }
    }
    return true;
}

function isObject(a) {
    return (!!a) && (a.constructor === Object);
};
