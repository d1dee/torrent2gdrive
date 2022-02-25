const db = require('./schemas/moviesSchema')
const {seasonEpisode} = require("./cron-job");


exports.scheduler = async (results, bot, chat_id) => {
    console.log(chat_id)
    const {
        genres,
        release_date,
        status,
        last_episode_to_air,
        name,
        next_episode_to_air,
        networks,
        number_of_seasons,
        original_name,
        title,
        id,
        media_type,
        original_title

    } = results

    let {
        air_date: last_episode_air_date,
        episode_number: last_episode_number,
        name: last_episode_name,
        season_number: last_episode_season_number
    } = last_episode_to_air ? last_episode_to_air : {}

    let {
        air_date: next_episode_air_date,
        episode_number: next_episode_number,
        name: next_episode_name,
        season_number: next_episode_season_number
    } = next_episode_to_air ? next_episode_to_air : {}
    try {
        if (status === 'Ended') return
        (await db.findOne({
            tmdb_id: id,
            chat_id: chat_id
        }).catch(err => console.log(err)))
            ? bot.sendMessage(chat_id, `${title || name} is already scheduled. ${
                (release_date > Date.now()) ? `Next download will be on ${release_date}`
                    : next_episode_air_date ? `Next download for S${next_episode_season_number} E${next_episode_number} will be on ${next_episode_air_date}`
                        : 'Awaiting announcement for the next release date.'
            }`)
                .catch((err) => console.log(err.message))
            : db.create({
                chat_id: chat_id,
                tmdb_id: id,
                title: title || name || original_title || original_name,
                number_of_seasons: number_of_seasons,
                type: media_type,
                release_date: release_date ,
                episode:(media_type === 'tv')?
                    {
                        last_episode_date: last_episode_air_date,
                        next_episode_date: next_episode_air_date,
                        last_episode: seasonEpisode(last_episode_season_number, last_episode_number),
                        next_episode: seasonEpisode(next_episode_season_number, next_episode_number),
                    }:undefined,
                genre: genres,
                networks: networks
            }).then(() => {
                bot.sendMessage(chat_id, `${title || name || original_title || original_name} added to schedule`)
                    .catch((err) => console.log(err.message))
            })

    } catch (err) {
        console.log(err)
    }

}
