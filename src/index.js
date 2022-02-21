require('dotenv').config({path: '.env'})
const dbCon = require('./dbConnect')
const tgBot = require('node-telegram-bot-api');
const {movieIndex, torrentDownload} = require("./puppet");
const {scheduler} = require("./schedule");
const {cron, tmdb_config} = require("./cron-job");
const db = require('./schemas/userSchema')
const {setAuth, listTeamDrive, driveInt} = require("./upload");
const {download} = require('./download')
const userDb = require("./schemas/userSchema");
const fs = require("fs");
const {path} = require("file");

dbCon.dbConnect().then(()=>{
    tmdb_config().catch(err => console.log(err))
}).catch(err => console.log(err))


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
            console.log(message_text)
            const movie = await movieIndex(message_text)
                .catch((err) => {
                    console.log(err)
                    bot.sendMessage(from.id, `<code>${err.message}</code>`, {
                        parse_mode: 'HTML'
                    })
                    throw err.message
                });
            movie.forEach(async (element) => {
                let {
                    id,
                    backdrop_path,
                    genre,
                    original_title,
                    original_language,
                    overview,
                    poster_path,
                    release_date,
                    title,
                    media_type,
                    vote_average
                } = element

                let messages = `<a href="${poster_path}"><b>${title} </b>(${media_type})  ${genre.toString()}</a>
Release date: ${release_date}  Rating: ${vote_average}

Plot: ${overview}`
                if (Date.parse(release_date) > Date.now()) {
                    bot.sendMessage(from.id, messages, {
                        parse_mode: 'HTML', cache_time: 0, "reply_markup": {
                            "inline_keyboard": [[{
                                "text": "⏬ Download ", "switch_inline_query_current_chat": title
                            }, {
                                "text": "⌚ Schedule ",
                                "callback_data": JSON.stringify({schedule: true, id, media_type})
                            },
                                {
                                    "text": "✈ More Info",
                                    "callback_data": JSON.stringify({more_info: true, id, media_type})
                                }]]
                        }
                    }).catch((err) => console.log(err.message))
                } else {
                    await bot.sendMessage(from.id, messages, {
                        parse_mode: 'HTML', cache_time: 0, "reply_markup": {
                            "inline_keyboard": [[{
                                "text": "⏬ Download ", "switch_inline_query_current_chat": title
                            }, {
                                "text": "✈ More Info",
                                "callback_data": JSON.stringify({more_info: true, id, media_type})
                            }]]
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

    const {from, data} = callback
    const {id, schedule, more_info, drive_id, media_type} = JSON.parse(data)

    if (drive_id) {
        listTeamDrive(callback, bot, data.replace(/^DriveId /, ''))
    } else if (schedule) {
        await scheduler(await movieIndex({id, media_type}), bot)
    } else if (more_info) {
        try {
            let {
                adult,
                belongs_to_collection,
                genres,
                imdb_id,
                original_language,
                original_title,
                overview,
                poster_path,
                popularity,
                release_date,
                runtime,
                status,
                tagline,
                vote_average,
                first_air_date,
                in_production,
                last_air_date,
                last_episode_to_air,
                name,
                next_episode_to_air,
                networks,
                number_of_seasons,
                original_name, title
            } = await movieIndex({id, media_type})

            let message =
                `<a href="${poster_path}"><b>${name || title}</b>  ${genres}</a>  
<i>${tagline}</i>

<b>Type:</b> ${media_type}    <b>Released date:</b> ${first_air_date || release_date}    <b>Ratings:</b> ${vote_average}

<b>Plot:</b> ${overview}`

            if (Date.parse(first_air_date) > Date.now() || Date.parse(release_date) > Date.now()) {
                await bot.sendMessage(from.id, message, {
                    parse_mode: 'HTML', cache_time: 0, "reply_markup": {
                        "inline_keyboard": [[{
                            "text": "⌚ Schedule",
                            "callback_data": JSON.stringify({schedule: true, id, media_type})
                        }]]
                    }
                })
            } else {
                await bot.sendMessage(from.id, message, {
                    parse_mode: 'HTML', cache_time: 0, "reply_markup": {
                        "inline_keyboard": [[{
                            "text": "⏬ Download ", "switch_inline_query_current_chat": title || name
                        }]]
                    }
                })
            }
        } catch (err) {
            console.log(err)
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