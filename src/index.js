require('dotenv').config({path: '.env'})
const dbCon = require('./dbConnect'), node_telegram_bot = require('node-telegram-bot-api'), {
        movieIndex,
        torrentDownload
    } = require("./puppet"), {scheduler} = require("./schedule"), db = require('./schemas/userSchema'), {
        setAuth,
        listTeamDrive,
        driveInt
    } = require("./upload"), {download} = require('./download'),
    userDb = require("./schemas/userSchema"), {cron_job} = require("./cron-job"), nodeCron = require("node-cron");

dbCon.dbConnect().then(() => console.log('db connected')).catch(err => console.log(err))

const {TELEGRAM_API} = process.env;
const bot = new node_telegram_bot(TELEGRAM_API, {polling: true})

let availableTorrents = []

bot.on('text', async (message) => {
    try {
        const {chat: {id: chat_id}, text, via_bot} = message;

        let message_text = text.toString().toLowerCase()

        let {token} = {}
        await db.findOne({chat_id: chat_id})
            .then(docs => {
                docs ? {token} = docs : null
            })
            .catch(err => console.log(err));

        token ? await setAuth(chat_id, bot) : null

        if (via_bot && !/^\//.test(message_text))
            return undefined

        switch (message_text) {
            case '/start': {
                await driveInt(message, bot)
                bot.sendMessage(chat_id, `Welcome to Torrent2GDrive. This bot can help you easily upload any torrent to Google Drive. Type <code>/help </code> for Help`, {
                    parse_mode: 'HTML'
                })
                break
            }
            case '/cron': {
                cron_job(bot)
                break
            }
            case '/auth_gdrive': {
                driveInt(message, bot)
                break
            }
            case '/list_team_drive': {
                await listTeamDrive(message, bot)
                break
            }
            case'/inline_search': {
                bot.sendMessage(chat_id, 'Click below to search using inline mode', {
                    reply_markup: {
                        inline_keyboard: [[{
                            text: 'Inline search',
                            switch_inline_query_current_chat: ''
                        }]]
                    }
                })
                break
            }
            case '/help': {
                bot.sendMessage(chat_id, 'Click below to get a list of all available commands', {
                    reply_markup: {
                        inline_keyboard: [[{
                            text: 'Help.',
                            switch_inline_query_current_chat: '/'
                        }]]
                    }
                })
                break
            }
            case  String(message_text.match(/^magnet:.*/ig)): {
                console.log(String(message_text.match(/^magnet:.*/ig)))
                download(message_text, bot, chat_id)
                break
            }
            default: {
                chatSearch(chat_id, message_text).catch(err => console.log(err))
            }
        }
    } catch (err) {
        console.log(err)
    }
})

bot.on('edited_message_text', ({chat: {id: chat_id}, text}) => {
    chatSearch(chat_id, text).catch(err => console.log(err))
})

async function chatSearch(chat_id, message_text) {
    let results = ((await movieIndex(message_text)
        .catch((err) => {
            console.log(err)
            bot.sendMessage(chat_id, `<code>${err.message}</code>`, {
                parse_mode: 'HTML'
            })
            throw err
        })).sort((a, b) => b.popularity > a.popularity)).slice(0,5)
    results.forEach(async (element) => {
        let {
            tmdb_id,
            genre,
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
            await bot.sendMessage(chat_id, messages, {
                parse_mode: 'HTML', cache_time: 0,
                reply_markup: {
                    inline_keyboard: [[{
                        text: "⌚ Schedule ",
                        callback_data: JSON.stringify({schedule: true, tmdb_id, media_type})
                    },
                        {
                            text: "✈ More Info",
                            callback_data: JSON.stringify({more_info: true, tmdb_id, media_type})
                        }]]
                }
            }).catch((err) => console.log(err))
        } else {
            await bot.sendMessage(chat_id, messages, {
                parse_mode: 'HTML', cache_time: 0,
                reply_markup: {
                    inline_keyboard: [[{
                        text: "⏬ Download ",
                        switch_inline_query_current_chat: title
                    }, {
                        text: "✈ More Info",
                        callback_data: JSON.stringify({more_info: true, tmdb_id, media_type})
                    }]]
                }
            }).catch((err) => console.log(err))
        }
    })
}


bot.on('callback_query', async (callback) => {
    const {message: {chat: {id: chat_id}}, data} = callback
    const {tmdb_id, schedule, more_info, drive_id, media_type} = JSON.parse(data)
    console.log(data)
    if (drive_id) {
        listTeamDrive(callback, bot, data)
    } else if (schedule) {
        await scheduler({tmdb_id, media_type}, bot, chat_id)
    } else if (more_info) {
        try {
            let {
                genres,
                overview,
                poster_path,
                release_date,
                tagline,
                vote_average,
                in_production,
                original_title, title
            } = await movieIndex({tmdb_id, media_type}).catch(err => {
                console.log(err)
            })
            let message =
                `<a href="${poster_path}"><b>${title || original_title}</b> <i>(${media_type}) ${genres}</i></a>  <i>${tagline ? '\n' + tagline : ''}</i>

<b>Type:</b> ${media_type}    <b>Released date:</b> ${release_date}    <b>Ratings:</b> ${vote_average}

<b>Plot:</b> ${overview}`

            if (Date.parse(release_date) > Date.now() || in_production) {
                bot.sendMessage(chat_id, message, {
                    parse_mode: 'HTML', cache_time: 0,
                    reply_markup: in_production && Date.parse(release_date) < Date.now() ? {
                        inline_keyboard: [[{
                            text: "⌚ Schedule",
                            callback_data: JSON.stringify({schedule: true, tmdb_id, media_type})
                        }, {text: "⏬ Download ", "switch_inline_query_current_chat": title || name}]]
                    } : {
                        inline_keyboard: [[{
                            text: "⌚ Schedule",
                            callback_data: JSON.stringify({schedule: true, tmdb_id, media_type})
                        }]]
                    }

                }).catch(err => console.log(err))
            } else {
                bot.sendMessage(chat_id, message, {
                    parse_mode: 'HTML', cache_time: 0, "reply_markup": {
                        inline_keyboard: [[{
                            text: "⏬ Download ", "switch_inline_query_current_chat": title || name
                        }]]
                    }
                }).catch(err => console.log(err))
            }
        } catch (err) {
            console.log(err)
        }
    }
})

bot.on('inline_query', async ({query, id: query_id}) => {
    if (/^\//.test(query)) {
        let inline_result = [], result_array = [{
            title: 'Start',
            command: '/start',
            description: 'Initialize this bot from to the original state.'
        }, {
            title: 'Help',
            command: '/help',
            description: 'Get a run-down of all supported features.'
        }, {
            title: 'Inline Search',
            command: '/inline_search',
            description: 'Use inline search to directly search for torrent files'
        }, {
            title: 'List Team Drives',
            command: '/list_team_drive',
            description: 'List team drives where upload will be uploaded to. If no team drive is specified, uploads are made directly to MyDrive'
        }]
        result_array.forEach((element, index) => {
            const {title, command, description} = element
            inline_result.push({
                type: "article",
                id: index,
                title: title,
                description: description,
                message_text: command
            })
        })
        bot.answerInlineQuery(query_id, inline_result).catch(err => console.log(err))
    } else if (!query || query.length < 3) {
        query ?
            bot.answerInlineQuery(query_id, [{
                type: "article",
                id: 0,
                title: "Searching....",
                description: "",
                message_text: query
            }], {cache_time: 0}).catch(err => console.log(err)) : null
    } else {
        await torrentDownload(query)
            .then((data) => {
                availableTorrents = data
                let response = []
                data.forEach(({age, leeches, name, seeds, size, type, provider}, index) => {
                    response.push({
                            type: 'article',
                            id: index,
                            title: name,
                            description: `Seeds: ${seeds}\t leeches: ${leeches}\t Uploaded by: ${provider}\t Upload Date: ${age}\t Size: ${size}\t Type: ${type}`,
                            message_text: `Downloading\n ${name}\n`,
                            reply_markup: {
                                inline_keyboard: [[{
                                    text: "⏬ Search Again ",
                                    switch_inline_query_current_chat: query
                                }]]
                            }
                        }
                    )
                })
                bot.answerInlineQuery(query_id, response, {cache_time: 1})
            })
            .catch(err => {
                if (err.search_error) {
                    bot.answerInlineQuery(query_id, [{
                        type: "article",
                        id: 0,
                        title: `No results found for ${query}`,
                        description: "Try checking for typing errors or try another search term.",
                        message_text: query || ' '
                    }])
                }
                console.log(err)
            })
    }
})

bot.on('chosen_inline_result', async (chosen_Inline) => {
    try {
        const {query, result_id, from: {id: chat_id}} = chosen_Inline
        if ((/^\//g).test(query)) return
        if (!await userDb.findOne({chat_id: chat_id, token: {$ne: null}})) {
            bot.sendMessage(chat_id, 'You\'ll have to authenticate your account so as to be able access your downloads.')
                .then(() => driveInt(chosen_Inline, bot))
                .catch((err) => console.log(err))
        } else {
            const {magnet} = availableTorrents[result_id];
            availableTorrents[result_id] ?
                download(magnet, bot, chat_id)
                : null
        }
    } catch (err) {
        console.log(err)
    }
})

nodeCron.schedule('0 */6 * * *', () => {
    cron_job(bot).catch(err => console.log(err))
}, {
    timezone: 'Africa/Nairobi'
})