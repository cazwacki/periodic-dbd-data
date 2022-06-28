const fetch = require('node-fetch');
const merge = require('deepmerge');
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

perform_check_for_fetch();

function perform_check_for_fetch() {
    check_for_fetch();
    setTimeout(perform_check_for_fetch, 60 * 1000);
}

function check_for_fetch() {

    let current_time_in_seconds = Math.floor(new Date() / 1000);

    if (next_shrine_fetch < current_time_in_seconds) {
        // check for new shrine
        console.log("Searching for new shrine...");
        fetch(urls["shrine"])
            .then(res => res.json())
            .then((out) => {
                let new_shrine = JSON.stringify(out.perks);
                let old_shrine = JSON.stringify(require('./shrine.json'));
                if (new_shrine != old_shrine) {
                    fs.writeFile("shrine.json", new_shrine, (err) => {
                        if (err) {
                            console.log("Failed to write shrine: ", err);
                        } else {
                            console.log("Shrine updated");
                            next_shrine_fetch = out.end + 5 * 60 * 1000; // 5 minutes after shrine is updated
                        }
                    });
                } else {
                    console.log("Shrine is up to date");
                    next_shrine_fetch = current_time_in_seconds + 30 * 60 * 1000;
                }
            })
            .catch(err => { throw err });
    }

    if (next_rift_fetch < current_time_in_seconds) {
        // check for new rift
        console.log("Searching for new rift...");
        fetch(urls["rift"])
            .then(res => res.json())
            .then((out) => {
                let new_rift_start = out[Object.keys(out).sort().pop()].start;
                let old_rift = require('./rift.json');
                if (new_rift_start >= old_rift.end) {
                    let new_rift_end = new_rift_start + 70 * 24 * 60 * 60;
                    fs.writeFile("rift.json", "{\"end\": \"" + new_rift_end + "\"}", (err) => {
                        if (err) {
                            console.log("Failed to write rift: ", err);
                        } else {
                            console.log("Rift updated");
                            next_rift_fetch = out.end + 5 * 60 * 1000; // 5 minutes after rift is updated
                        }
                    });
                } else {
                    console.log("Rift is up to date");
                    next_rift_fetch = current_time_in_seconds + 30 * 60 * 1000;
                }
            })
            .catch(err => { throw err });
    }

    if (next_version_check < current_time_in_seconds) {
        // get latest version
        console.log("Checking game version");
        fetch(urls["version"])
            .then(res => res.json())
            .then((out) => {
                let versions = out.availableVersions;
                let saved_version = require('./version.json');
                let latest_version = Object.keys(versions)
                    .filter(k => !k.startsWith("m_"))
                    .pop();
                if (latest_version != saved_version.latest) {
                    // update saved version
                    fs.writeFile("version.json", "{\"latest\": \"" + latest_version + "\"}", (err) => {
                        if (err) {
                            console.log("Failed to write version: ", err);
                        } else {
                            console.log("Version updated");
                            next_version_check = current_time_in_seconds + 24 * 60 * 60 * 1000; // next day
                        }
                    });
                    version_update();
                } else {
                    console.log("Version is up to date");
                    next_version_check = current_time_in_seconds + 30 * 60 * 1000;
                }
            })
            .catch(err => { throw err });
    }
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
                fixed_json += '"' + out[key].name.replaceAll('\"', '\\\"').replaceAll("We'll make it", "We'll Make It") + '":{';

                // fix description
                let description = out[key].description.replaceAll('\"', '\\\"');
                for (let i = 0; i < out[key].tunables.length; i++) {
                    description = description.replaceAll('{' + i + '}', out[key].tunables[i].join("/"));
                }

                fixed_json += '"description":"' + description + '",';
                fixed_json += '"role": "' + out[key].role + '"';
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
                    fixed_json += '"description":"' + out[key].description.replaceAll('\"', '\\\"') + '"';
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
                    fixed_json += '"description":"' + out[key].description.replaceAll('\"', '\\\"').replaceAll("&nbsp;", " ") + '"';
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
                }
            });
        })
        .catch(err => { throw err });
}