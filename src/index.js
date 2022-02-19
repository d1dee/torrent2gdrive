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
const fs = require("fs");

dbCon.dbConnect()

const {TELEGRAM_API} = process.env;
const bot = new tgBot(TELEGRAM_API, {polling: true})

var availableTorrents = []

bot.on('message', async (msg) => {
    try {
        const {chat, reply_to_message, text, from, via_bot} = msg;
        let {token, tokenMsg} = await db.findOne({id: from.id})
        let message_text = text.toString().toLowerCase()

        if (token !== null) await setAuth(msg, bot)

        if (via_bot) return null
        else if (message_text === '/start' || reply_to_message) {
            if (reply_to_message && tokenMsg === reply_to_message.message_id) {
                await driveInt(msg, bot, tokenMsg)
            } else if (message_text === '/start') {
                await driveInt(msg, bot)
                await bot.sendMessage(chat.id, 'Welcome to Torrent2GoogleDrive. ' + 'This bot can help you easily upload any torrent to Google Drive. Type <code>/help </code> for Help', {
                    reply_markup: {parse_mode: 'HTML'}
                })
            }
        } else if (message_text === '/list_team_drive') {
            await listTeamDrive(msg, bot)
        } else if (message_text === '/inline_search') {
            await bot.sendMessage(chat.id, 'Click below to search using inline mode', {
                reply_markup: {
                    inline_keyboard: [[{
                        text: 'Inline search', switch_inline_query_current_chat: ''
                    }]]
                }
            })
        } else if (message_text === '/help') {
            await bot.sendMessage(chat.id, 'Click below to get a list of all available commands', {
                reply_markup: {
                    inline_keyboard: [[{
                        text: 'Help.', switch_inline_query_current_chat: '/'
                    }]]
                }
            })
        } else if (/^magnet:.*/ig.test(message_text)) {
            await download(message_text, bot, chat.id)
        } else {
            const movie = await movieIndex(message_text)
                .catch((err) => {
                    console.log(err.message)
                    bot.sendMessage(from.id, `<code>${err.message}</code>`, {
                        parse_mode: 'HTML'
                    })
                });
            movie.forEach(async (element, index) => {
                const {
                    id,
                    backdrop_path,
                    genre_ids,
                    original_title,
                    original_language,
                    overview,
                    poster_path,
                    release_date,
                    title,
                    media_type,
                    vote_average
                } = element
                let tmdb
                fs.readFile(`${__dirname}/tmdb.json`, {encoding: 'utf8',}, function (err, data) {
                    if (err) return console.log(err.message)
                    tmdb = JSON.parse(data)
                })
                const {images: {secure_base_url, base_url}} = tmdb,
                    messages = `<a href="${secure_base_url}/original/${poster_path}"><b>${title}     ${media_type}</b></a>
Release date: ${release_date}  Rating: ${vote_average}

Plot: ${overview}`
                if (Date.parse(release_date) > Date.now()) {
                    bot.sendMessage(from.id, messages, {
                        parse_mode: 'HTML', cache_time: 0, "reply_markup": {
                            "inline_keyboard": [[{
                                "text": "⏬ Download ", "switch_inline_query_current_chat": title
                            }, {"text": "⌚ Schedule ", "callback_data": '⌚ ' + id}, {
                                "text": "✈ More Info", "callback_data": id
                            }]]
                        }
                    }).catch((err) => console.log(err.message))
                } else {
                    await bot.sendMessage(from.id, messages, {
                        parse_mode: 'HTML', cache_time: 0, "reply_markup": {
                            "inline_keyboard": [[{
                                "text": "⏬ Download ", "switch_inline_query_current_chat": title
                            }, {"text": "✈ More Info", "callback_data": id}]]
                        }
                    }).catch((err) => console.log(err.message))
                }
            })
        }
    } catch (err) {
        console.log(err.message)
    }
})

bot.on('callback_query', async (callback) => {
    console.log(callback)
    const {from: {id}, data} = callback
    if (/^DriveId */ig.test(data)) {
        listTeamDrive(callback, bot, data.replace(/^DriveId /, ''))
    } else if (/^⌚.*/ig.test(data)) {
        await schedule(callback, bot)
    } else {
        try {
            let message = `Title: ${title}  Released:Ratings:\t' +
               vote_average + '\nPlot:\t' + overview`

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
                availableTorrents.forEach(({age, leeches, name, seeds, size, type}, index) => {
                    result = {
                        'type': 'article',
                        'id': index,
                        'title': name,
                        'description': `Seeds: ${seeds}\t leeches: ${leeches}\t Upload Date: ${age}\t Size: ${size}\t Type: ${type}`,
                        'message_text': `Downloading\n ${name}\n`,
                        "reply_markup": {
                            "inline_keyboard": [[{
                                "text": "⏬ Search Again ", "switch_inline_query_current_chat": query
                            }]]
                        }
                    }
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