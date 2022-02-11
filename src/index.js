require('dotenv').config({path: '.env'})
const dbCon = require('./dbConnect')
const tgBot = require('node-telegram-bot-api');
const {movieIndex, torrentDownload} = require("./puppet");
const {schedule} = require("./schedule");
const {cron} = require("./cron-job");
const db = require('./schemas/userSchema')
const {setAuth, listTeamDrive, driveInt} = require("./upload");
const {download} = require('./download')

dbCon.dbConnect().then()

const token = process.env.TELEGRAM_API

const bot = new tgBot(token, {polling: true})

let chatId, message
var availableTorrents = []

bot.on('message', async (msg) => {
    try {
        let user = await db.findOne({id: msg.from.id}), chatId = msg.chat.id
        message = msg.text
        if (user && user.token != null) await setAuth(msg, bot)
        if (message.toString().toLowerCase() === '/start' || msg.reply_to_message) {
            if (msg.reply_to_message && user.tokenMsg === msg.reply_to_message.message_id) {
                await driveInt(msg, bot, user.tokenMsg)
            } else if (!user || message.toString().toLowerCase() === '/start') {
                await driveInt(msg, bot)
                await bot.sendMessage(chatId, 'Welcome to Gdl', {
                    'reply_markup': {'replyKeyboard': [[{'text': '/inline'}]]}
                })
            }
        } else if (message.toString().toLowerCase() === '/team') {
            await bot.sendMessage(chatId, 'Welcome to Gdl', {
                "reply_markup": {
                    "keyboard": [['/Start ', '/Scheduled'], ['/Inline', '/Help']], 'resize_keyboard': true
                }
            })
            await listTeamDrive(msg, bot)
        } else if (message.toString().toLowerCase() === '/inline') {
            await bot.sendMessage(chatId, 'Click below to search using inline mode', {
                reply_markup: {
                    inline_keyboard: [[{
                        text: 'Inline search', switch_inline_query_current_chat: ''
                    }]]
                }
            })
        } else if (message.toString().toLowerCase() === '/help') {
            await bot.sendMessage(chatId, 'Help not yet imprinted, Sorry :(')
        } else if (/^Downloading.*/ig.test(message) === true) {
            //update progress
        } else if (/^magnet:.*/ig.test(message) === true) {
            await download(message, bot, chatId)
        } else {
            let searched = (await movieIndex(message)).data
            if (searched.Response === 'False') {
                await bot.sendMessage(chatId, 'No results found, please check for any typos\n <code>' + searched.Error + '</code>', {parse_mode: 'HTML'})
                    .catch((err)=> console.log(err.message))
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
                        await bot.sendMessage(chatId, message, {
                            parse_mode: 'HTML', cache_time: 0, "reply_markup": {
                                "inline_keyboard": [[{
                                    "text": "⏬ Download ", "switch_inline_query_current_chat": title
                                }, {"text": "⌚ Schedule ", "callback_data": '⌚ ' + imdb}, {
                                    "text": "✈ More Info", "callback_data": imdb
                                }]]
                            }
                        }).catch((err)=> console.log(err.message))

                    }

                    ///checks if release date is in the future
                    else if (Date.parse(year) > Date.now()) {

                        await bot.sendMessage(chatId, message, {
                            parse_mode: 'HTML', cache_time: 0, "reply_markup": {
                                "inline_keyboard": [[{
                                    "text": "⌚ Schedule ", "callback_data": '⌚ ' + imdb
                                }, {"text": "✈ More Info", "callback_data": imdb}]]
                            }
                        }).catch((err)=> console.log(err.message))
                    }
                    //if already released give option to download
                    else {
                        await bot.sendMessage(chatId, message, {
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
    let callback_data = callback.data, callbackChatId = callback.from.id;

    if (/^⌚.*/ig.test(callback_data) === true) {
        await schedule(callback, bot)
    } else {
        let omdbResult = (await movieIndex(callback_data)).data;

        try {
            let message = 'Title:\t' + omdbResult.Title + '\nReleased:\t' + omdbResult.Released + '\nRatings:\t' + omdbResult.imdbRating + '\nPlot:\t' + omdbResult.Plot

            if (Date.parse(omdbResult.Released) > Date.now()) {
                await bot.sendMessage(callbackChatId, '<a href="' + omdbResult.Poster + '">\n</a>' + message, {
                    parse_mode: 'HTML', cache_time: 0, "reply_markup": {
                        "inline_keyboard": [[{"text": "⌚ Schedule", "callback_data": '⌚ ' + callback_data}]]
                    }
                })
            } else {
                await bot.sendMessage(callbackChatId, '<a href="' + omdbResult.Poster + '">\n</a>' + message, {
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

bot.on('inline_query', async (inlineQuery) => {
    chatId = inlineQuery.from.id
    let queryId = inlineQuery.id, query = inlineQuery.query, result, inlineQueryResult = []
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
                for (let i = 0; i < 50; i++) {
                    try {
                        if (availableTorrents[i].seeds < availableTorrents[i].leeches) {
                            i++
                        } else {
                            result = {
                                'type': 'article',
                                'id': i,
                                'title': availableTorrents[i].name,
                                'description': 'Seeds:' + availableTorrents[i].seeds + '\t leeches:' + availableTorrents[i].leeches + '\t Age:' + availableTorrents[i].age + '\t Size:' + availableTorrents[i].size + '\t Type:' + availableTorrents[i].type,
                                'message_text': 'Downloading \n' + availableTorrents[i].name + '\n',
                                "reply_markup": {
                                    "inline_keyboard": [[{
                                        "text": "⏬ Search Again ", "switch_inline_query_current_chat": query
                                    }]]
                                }
                            }
                            inlineQueryResult.push(result)
                        }
                    } catch (e) {
                        result = `[{"type":"article","id":0,"title":"Schedule this search?","description":"",' +
                            '"message_text":"⌚ ${query}"}]`
                        await bot.answerInlineQuery(queryId, result, {cache_time: 0})
                    }
                }
            }
        }
    } catch (err) {
        console.log(err.message)
    }
    try {
        result = JSON.stringify(inlineQueryResult)
        await bot.answerInlineQuery(queryId, result, {cache_time: 0})
    } catch (err) {
        console.log(err.message)
    }
})

bot.on('chosen_inline_result', async (chosen_Inline) => {
    try {
        if (availableTorrents[chosen_Inline.result_id]) await download(availableTorrents[chosen_Inline.result_id].magnet, bot, chosen_Inline.from.id)
    } catch (err) {
        console.log(err)
    }
})

cron(bot)