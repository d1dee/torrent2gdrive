require('dotenv').config({path: '.env'})
const dbCon = require('./dbConnect')
const tgBot = require('node-telegram-bot-api');
const {movieIndex, torrentDownload} = require("./puppet");
const {schedule} = require("./schedule");
const {cron} = require("./cron-job");
const db = require('./schemas/userSchema')
const {setAuth, listTeamDrive, driveInt} = require("./upload");
const {download} = require('./download')
const userDb = require("./schemas/userSchema");

dbCon.dbConnect()

const {TELEGRAM_API} = process.env;
const bot = new tgBot(TELEGRAM_API, {polling: true})

var availableTorrents = []

bot.on('message', async (msg) => {
    try {
        const {chat, reply_to_message, text, from} = msg;
        let {token, tokenMsg} = await db.findOne({id: from.id})
        if (token != null) await setAuth(msg, bot)
        if (text.toString().toLowerCase() === '/start' || reply_to_message) {
            if (reply_to_message && tokenMsg === reply_to_message.message_id) {
                await driveInt(msg, bot, tokenMsg)
            } else if (text.toString().toLowerCase() === '/start') {
                await driveInt(msg, bot)
                await bot.sendMessage(chat.id, 'Welcome to Gdl', {
                    'reply_markup': {'replyKeyboard': [[{'text': '/inline'}]]}
                })
            }
        } else if (text.toString().toLowerCase() === '/list_team_drive') {
            await listTeamDrive(msg, bot)
        } else if (text.toString().toLowerCase() === '/inline') {
            await bot.sendMessage(chat.id, 'Click below to search using inline mode', {
                reply_markup: {
                    inline_keyboard: [[{
                        text: 'Inline search', switch_inline_query_current_chat: ''
                    }]]
                }
            })
        } else if (text.toString().toLowerCase() === '/help') {
            await bot.sendMessage(chat.id, 'Help not yet imprinted, Sorry :(')
        } else if (/^Downloading.*/ig.test(text)) {
            //update progress
        } else if (/^magnet:.*/ig.test(text)) {
            await download(text, bot, chat.id)
        } else {
            let searched = (await movieIndex(text)).data
            if (searched.Response === 'False') {
                await bot.sendMessage(chat.id, 'No results found, please check for any typos\n <code>' + searched.Error + '</code>', {parse_mode: 'HTML'})
                    .catch((err) => console.log(err.message))
                return
            }
            try {
                for (let i = 0; i < (searched.Search).length; i++) {
                    let title = searched.Search[i].Title, imdb = searched.Search[i].imdbID,
                        type = searched.Search[i].Type, poster = searched.Search[i].Poster,
                        more_info = (await movieIndex(imdb))
                    let year = more_info.data.Released, genre = more_info.data.Genre,
                        imdbRating = more_info.data.imdbRating
                    let message = '<a href="' + poster + '">\n</a>' + '<b>' + title + '</b> \n' + 'Year: ' + year + '\n' + 'Type: ' + type + '\n' + 'Genre: ' + genre + '\n' + 'Rating: ' + imdbRating + '\n'

                    if (type === 'game') {
                        i++
                    } else if (/\d$/.test((more_info.data.Year).toString()) === false) {
                        await bot.sendMessage(chat.id, message, {
                            parse_mode: 'HTML', cache_time: 0, "reply_markup": {
                                "inline_keyboard": [[{
                                    "text": "⏬ Download ", "switch_inline_query_current_chat": title
                                }, {"text": "⌚ Schedule ", "callback_data": '⌚ ' + imdb}, {
                                    "text": "✈ More Info", "callback_data": imdb
                                }]]
                            }
                        }).catch((err) => console.log(err.message))

                    }

                    ///checks if release date is in the future
                    else if (Date.parse(year) > Date.now()) {

                        await bot.sendMessage(chat.id, message, {
                            parse_mode: 'HTML', cache_time: 0, "reply_markup": {
                                "inline_keyboard": [[{
                                    "text": "⌚ Schedule ", "callback_data": '⌚ ' + imdb
                                }, {"text": "✈ More Info", "callback_data": imdb}]]
                            }
                        }).catch((err) => console.log(err.message))
                    }
                    //if already released give option to download
                    else {
                        await bot.sendMessage(chat.id, message, {
                            parse_mode: 'HTML', cache_time: 0, "reply_markup": {
                                "inline_keyboard": [[{
                                    "text": "⏬ Download ", "switch_inline_query_current_chat": title
                                }, {"text": "✈ More Info", "callback_data": imdb}]]
                            }
                        }).catch((err) => console.log(err.message))
                    }
                }
            } catch (err) {
                console.log(err)
            }
        }
    } catch (err) {
        console.log(err)
    }
})

bot.on('callback_query', async (callback) => {
    const {from: {id}, data} = callback;

    if (/^DriveId */ig.test(data)) {
        listTeamDrive(callback, bot, data.replace(/^DriveId /, ''))
    } else if (/^⌚.*/ig.test(data)) {
        await schedule(callback, bot)
    } else {
        let omdbResult = (await movieIndex(data)).data;

        try {
            let message = 'Title:\t' + omdbResult.Title + '\nReleased:\t' + omdbResult.Released + '\nRatings:\t' + omdbResult.imdbRating + '\nPlot:\t' + omdbResult.Plot

            if (Date.parse(omdbResult.Released) > Date.now()) {
                await bot.sendMessage(id, '<a href="' + omdbResult.Poster + '">\n</a>' + message, {
                    parse_mode: 'HTML', cache_time: 0, "reply_markup": {
                        "inline_keyboard": [[{"text": "⌚ Schedule", "callback_data": '⌚ ' + data}]]
                    }
                })
            } else {
                await bot.sendMessage(id, '<a href="' + omdbResult.Poster + '">\n</a>' + message, {
                    parse_mode: 'HTML', cache_time: 0, "reply_markup": {
                        "inline_keyboard": [[{
                            "text": "⏬ Download ", "switch_inline_query_current_chat": omdbResult.Title
                        }]]
                    }
                })
            }
        } catch (err) {
            console.log(err.message)
        }
    }
})

bot.on('inline_query', async ({id: queryId, query}) => {
    let result, inlineQueryResult = []
    try {
        if (!query || query.length < 3) {
            ///limiting searching to for fewer characters to avoid waste of processing power and reduce que
            // Also might want to add offset later on once you figure them out
            result = '[{"type":"article","id":0,"title":"Searching....","description":"","message_text":"' + query + '"}]'
            await bot.answerInlineQuery(queryId, result, {cache_time: 0})
        } else {
            //Pass to torrent download to fetch all available torrents
            availableTorrents = await torrentDownload(query)
            if (!availableTorrents || !availableTorrents.length) {
                result = '[{"type":"article","id":0,"title":"Schedule this search?","description":"","message_text":"' + query + '"}]'
                await bot.answerInlineQuery(queryId, result, {cache_time: 0})
            } else {
                let i = 0
                availableTorrents.forEach(({age, leeches, name, seeds, size, type}) => {
                    result = {
                        'type': 'article',
                        'id': i,
                        'title': name,
                        'description': `Seeds: ${seeds}\t leeches: ${leeches}\t Upload Date: ${age}\t Size: ${size}\t Type: ${type}`,
                        'message_text': `Downloading\n ${name}\n`,
                        "reply_markup": {
                            "inline_keyboard": [[{
                                "text": "⏬ Search Again ", "switch_inline_query_current_chat": query
                            }]]
                        }
                    }
                    i++
                    inlineQueryResult.push(result)
                })
            }
        }
    } catch (err) {
        console.log(err.message)
    }
    await bot.answerInlineQuery(queryId, JSON.stringify(inlineQueryResult), {cache_time: 0})
        .catch((err) => console.log(err.message))
})

bot.on('chosen_inline_result', async (chosen_Inline) => {
    try {
        const {result_id, from: {id}} = chosen_Inline;
        if (!await userDb.findOne({id: id, token: {$ne: null}})) {
            await bot.sendMessage(id, 'You\'ll have to authenticate your account so as to be able access your downloads.')
                .catch((err) => console.log(err.message))
            await driveInt(chosen_Inline, bot)
        } else {
            if (availableTorrents[result_id]) {
                const {magnet} = availableTorrents[result_id];
                await download(magnet, bot, id)
            }
        }
    } catch (err) {
        console.log(err)
    }
})

cron(bot)