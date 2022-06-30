const fetch = require('node-fetch');
const merge = require('deepmerge');
const { exec } = require('child_process');
const fs = require('fs');

let urls = {
    "addons": "https://dbd.tricky.lol/api/addons",
    "items": "https://dbd.tricky.lol/api/items",
    "killers": "https://dbd.tricky.lol/api/characters?role=killer",
    "perks": "https://dbd.tricky.lol/api/perks",
    "rift": "https://dbd.tricky.lol/api/rift",
    "shrine": "https://dbd.tricky.lol/api/shrine",
    "version": "https://steam.live.bhvrdbd.com/api/v1/utils/contentVersion/version"
}

let next_shrine_fetch = 0;
let next_rift_fetch = 0;
let next_version_check = 0;

let queued_cmds = [];

perform_check_for_fetch();

function perform_check_for_fetch() {
    check_for_fetch();
    setTimeout(perform_check_for_fetch, 60 * 1000);
}

String.prototype.replaceAll = function (strReplace, strWith) {
    var esc = strReplace.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    var reg = new RegExp(esc, 'ig');
    return this.replace(reg, strWith);
};

function check_for_fetch() {

    // execute any needed git pushes
    if (queued_cmds.length > 0) {
        let command = queued_cmds.shift()
        exec(command, (err, stdout, stderr) => {
            if (!err) {
                console.log('Successfully ran: "', command, '"');
            }
        });
    }

    let current_time_in_seconds = Math.floor(new Date() / 1000);

    if (next_shrine_fetch < current_time_in_seconds) {
        // check for new shrine
        console.log("Searching for new shrine...");
        fetch(urls["shrine"])
            .then(res => res.json())
            .then((out) => {
                let new_shrine = JSON.stringify(out.perks);
                // name conversions
                let perks = require('./perks');
                for (let key of Object.keys(perks)) {
                    new_shrine = new_shrine.replace(perks[key].alt_name, key
                        + '","description":"' + perks[key].description.replaceAll('"', '\\\"')
                        + '","url":"' + perks[key].url
                        + '","img_url":"' + perks[key].img_url);
                }

                let old_shrine = JSON.stringify(require('./shrine.json'));
                if (new_shrine != old_shrine) {
                    fs.writeFile("shrine.json", new_shrine, (err) => {
                        if (err) {
                            console.log("Failed to write shrine: ", err);
                        } else {
                            console.log("Shrine updated");
                            queued_cmds.push('git add shrine.json && git commit -m "Automated Shrine Update" && git push');
                            next_shrine_fetch = out.end + 5 * 60 * 1000; // 5 minutes after shrine is updated
                        }
                    });
                } else {
                    console.log("Shrine is up to date");
                    next_shrine_fetch = current_time_in_seconds + 30 * 60;
                }
            })
            .catch(err => { throw err });
    }

    // if (next_rift_fetch < current_time_in_seconds) {
    //     // check for new rift
    //     console.log("Searching for new rift...");
    //     fetch(urls["rift"])
    //         .then(res => res.json())
    //         .then((out) => {
    //             let new_rift_start = out[Object.keys(out).sort().pop()].start;
    //             let old_rift = require('./rift.json');
    //             if (new_rift_start >= old_rift.end) {
    //                 let new_rift_end = new_rift_start + 70 * 24 * 60 * 60;
    //                 fs.writeFile("rift.json", "{\"end\": \"" + new_rift_end + "\"}", (err) => {
    //                     if (err) {
    //                         console.log("Failed to write rift: ", err);
    //                     } else {
    //                         console.log("Rift updated");
    //                         queued_cmds.push('git add rift.json && git commit -m "Automated Rift Update" && git push');
    //                         next_rift_fetch = out.end + 5 * 60 * 1000; // 5 minutes after rift is updated
    //                     }
    //                 });
    //             } else {
    //                 console.log("Rift is up to date");
    //                 next_rift_fetch = current_time_in_seconds + 30 * 60;
    //             }
    //         })
    //         .catch(err => { throw err });
    // }

    // if (next_version_check < current_time_in_seconds) {
    //     // get latest version
    //     console.log("Checking game version");
    //     fetch(urls["version"])
    //         .then(res => res.json())
    //         .then((out) => {
    //             let versions = out.availableVersions;
    //             let saved_version = require('./version.json');
    //             let latest_version = Object.keys(versions)
    //                 .filter(k => !k.startsWith("m_"))
    //                 .pop();
    //             if (latest_version != saved_version.latest) {
    //                 // update saved version
    //                 fs.writeFile("version.json", "{\"latest\": \"" + latest_version + "\"}", (err) => {
    //                     if (err) {
    //                         console.log("Failed to write version: ", err);
    //                     } else {
    //                         console.log("Version updated");
    //                         queued_cmds.push('git add version.json && git commit -m "Automated Version Update" && git push');
    //                         next_version_check = current_time_in_seconds + 24 * 60 * 60 * 1000; // next day
    //                     }
    //                 });
    //                 version_update();
    //             } else {
    //                 console.log("Version is up to date");
    //                 next_version_check = current_time_in_seconds + 30 * 60;
    //             }
    //         })
    //         .catch(err => { throw err });
    // }
}

// update perks, items, killers, and addons
// get data, build JSON and merge it with our extra data
function version_update() {
    // perks 
    fetch(urls["perks"])
        .then(res => res.json())
        .then((out) => {
            let fixed_json = '{';
            for (let key of Object.keys(out)) {
                fixed_json += '"' + out[key].name.replaceAll('\"', '\\\"')
                    .replaceAll("We'll make it", "We'll Make It")
                    .replaceAll("Barbecue & Chili", "Barbecue & Chilli")
                    .replaceAll("’", "'")
                    .replaceAll("&nbsp;", " ")
                    .replaceAll("Hex: Blood Favor", "Hex: Blood Favour")
                    .replaceAll("Make your Choice", "Make Your Choice")
                    .replaceAll("Play with your food", "Play with Your Food")
                    .replaceAll("Save the best for last", "Save the Best for Last")
                    .replaceAll("Deja Vu", "Déjà Vu") + '":{';

                // fix description
                let description = out[key].description.replaceAll('\"', '\\\"');
                for (let i = 0; i < out[key].tunables.length; i++) {
                    let tunable = out[key].tunables[i];
                    if (tunable.length == 3) {
                        let colored_tunable = '<span style=\\\"color:#FFD700\\\">' + out[key].tunables[i][0] +
                            '</span>/<span style=\\\"color:#7CFC00\\\">' + out[key].tunables[i][1] +
                            '</span>/<span style=\\\"color:#CF9FFF\\\">' + out[key].tunables[i][2] + '</span>';
                        description = description.replaceAll("{" + i.toString() + "}", colored_tunable);
                    } else {
                        description = description.replaceAll("{" + i.toString() + "}", out[key].tunables[i].join("/"));
                    }
                }
                description = beautify(description);

                fixed_json += '"description":"' + description + '",';
                fixed_json += '"role": "' + out[key].role + '",';
                fixed_json += '"alt_name": "' + key + '"';
                fixed_json += "},";
            }

            fixed_json = fixed_json.slice(0, -1) + "}";

            let perk_info = JSON.parse(fixed_json);
            let perk_extras = require('./perk_extras');

            fs.writeFile("perks.json", JSON.stringify(merge(perk_info, perk_extras)), (err) => {
                if (err) {
                    console.log("Failed to update perks: ", err);
                } else {
                    console.log("Perks updated");
                    queued_cmds.push('git add perks.json && git commit -m "Automated Perks Update" && git push');
                }
            });
        })
        .catch(err => { throw err });

    // items 
    fetch(urls["items"])
        .then(res => res.json())
        .then((out) => {
            let fixed_json = '{';
            for (let key of Object.keys(out)) {
                if (out[key].name != null) {
                    fixed_json += '"' + out[key].name.replaceAll('\"', '\\\"') + '":{';
                    fixed_json += '"description":"' + beautify(out[key].description.replaceAll('\"', '\\\"')) + '"';
                    fixed_json += "},";
                }
            }

            fixed_json = fixed_json.slice(0, -1) + "}";

            let item_info = JSON.parse(fixed_json);
            let item_extras = require('./item_extras');

            fs.writeFile("items.json", JSON.stringify(merge(item_info, item_extras)), (err) => {
                if (err) {
                    console.log("Failed to update items: ", err);
                } else {
                    console.log("Items updated");
                    queued_cmds.push('git add items.json && git commit -m "Automated Items Update" && git push');
                }
            });
        })
        .catch(err => { throw err });

    // addons 
    fetch(urls["addons"])
        .then(res => res.json())
        .then((out) => {
            let fixed_json = '{';
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
                    fixed_json += '"' + addon_name + '":{';
                    fixed_json += '"description":"' + beautify(out[key].description.replaceAll('\"', '\\\"').replaceAll("&nbsp;", " ")) + '"';
                    fixed_json += "},";
                }
            }

            fixed_json = fixed_json.slice(0, -1) + "}";

            let addon_info = JSON.parse(fixed_json);
            let addon_extras = require('./addon_extras');

            fs.writeFile("addons.json", JSON.stringify(merge(addon_info, addon_extras)), (err) => {
                if (err) {
                    console.log("Failed to update addons: ", err);
                } else {
                    console.log("Addons updated");
                    queued_cmds.push('git add addons.json && git commit -m "Automated Addons Update" && git push');
                }
            });
        })
        .catch(err => { throw err });

    // killers 
    fetch(urls["killers"])
        .then(res => res.json())
        .then((out) => {
            let fixed_json = '{';
            for (let key of Object.keys(out)) {
                if (out[key].name != null) {
                    fixed_json += '"' + out[key].name.replaceAll('\"', '\\\"').replaceAll("’", "'") + '":{';
                    fixed_json += '"description":"' + out[key].bio.split(".")[0].replaceAll('\"', '\\\"') + '."';
                    fixed_json += "},";
                }
            }

            fixed_json = fixed_json.slice(0, -1) + "}";

            let killer_info = JSON.parse(fixed_json);
            let killer_extras = require('./killer_extras');

            fs.writeFile("killers.json", JSON.stringify(merge(killer_info, killer_extras)), (err) => {
                if (err) {
                    console.log("Failed to update killers: ", err);
                } else {
                    console.log("Killers updated");
                    queued_cmds.push('git add killers.json && git commit -m "Automated Killers Update" && git push');
                }
            });
        })
        .catch(err => { throw err });
}

function beautify(description) {
    // connect multi-word terms
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
        .replaceAll('.', '. ');

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
    let color_counter = ['Token', 'Tokens', 'second', 'seconds', 'meter', 'meters', '%'];

    let split_desc = description.split(/\s+/);
    for (let i = 0; i < split_desc.length; i++) {
        let color = '';
        if (general_keywords.find(element => { return element.toLowerCase() === split_desc[i].replaceAll('.', '').toLowerCase(); }) !== undefined) {
            color = '#FFD700';
        } else if (states.find(element => { return element.toLowerCase() === split_desc[i].replaceAll('.', '').toLowerCase(); }) !== undefined) {
            color = '#008080';
        } else if (good_status_effects.find(element => { return element.toLowerCase() === split_desc[i].replaceAll('.', '').toLowerCase(); }) !== undefined) {
            color = '#7CFC00';
        } else if (bad_status_effects.find(element => { return element.toLowerCase() === split_desc[i].replaceAll('.', '').toLowerCase(); }) !== undefined) {
            color = '#D2042D';
        } else if (killer_keywords.find(element => { return element.toLowerCase() === split_desc[i].replaceAll('.', '').toLowerCase(); }) !== undefined) {
            color = '#CF9FFF';
        } else if (color_counter.find(element => { return element.toLowerCase() === split_desc[i].replaceAll('.', '').toLowerCase(); }) !== undefined) {
            color = '#FFA500';
        }

        if (color != '') {
            if (color == "#FFA500" && !isNaN(split_desc[i - 1])) {
                split_desc[i - 1] = '<span style=\\\"color:' + color + '\\\">' + split_desc[i - 1] + '</span>';
            }
            split_desc[i] = '<span style=\\\"color:' + color + '\\\">' + split_desc[i] + '</span>';
        }
    }

    description = split_desc.join(" ");

    // disconnect multi-word terms
    description = description.replaceAll("_", " ");
    return description;
}