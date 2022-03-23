let dates = require('./json_data/expirations.json')
let shrine = require('./json_data/shrine.json')
let active_players = require('./json_data/active_players.json')
let steam_news = require('./json_data/steam_news.json')

let express = require("express");
let app = express();

let ms_to_next_hr = 3600000 - new Date().getTime() % 3600000;
let hr = 1000 * 60 * 60

let mapping = [
	{
		path: '/dates',
		file: require('./json_data/expirations.json'),
		update_interval: hour
	},
	{
		path: '/shrine',
		file: require('./json_data/shrine.json'),
		update_interval: 24 * hour
	},
	{
		path: '/active_players',
		file: require('./json_data/active_players.json'),
		update_interval: 0.25 * hour
	},
	{
		path: '/steam_news',
		file: require('./json_data/steam_news.json'),
		update_interval: 0.25 * hour
	},
]

mappings.forEach((endpoint, _) => {
	app.get(endpoint.path, (req, res, next) => {
		res.send(endpoint.file)
	}
})
