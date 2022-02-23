const db = require('./schemas/moviesSchema')
const {movieIndex} = require("./puppet");

exports.scheduler = async (results, bot, chat_id) => {
    console.log(chat_id)
    const {
        genres,
        overview,
        poster_path,
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
        original_name,
        title,
        id,
        media_type,
        original_title

    } = results
    let {air_date, episode_number, season_number} = {}
    next_episode_to_air ? {air_date, episode_number, season_number} = next_episode_to_air : null
    try {
        if (status === 'Ended') return
        (await db.findOne({
            tmdb_id: id,
            chat_id: chat_id
        }).catch(err => console.log(err)))
            ? bot.sendMessage(chat_id, `${title || name} is already scheduled. ${
                (release_date || first_air_date > Date.now()) ? `Next download will be on ${release_date || first_air_date}`
                    : air_date ? `Next download for S${season_number} E${episode_number} will be on ${air_date}` : 'Awaiting announcement for the next release date.'
            }`)
                .catch((err) => console.log(err.message))
            : db.create({
                chat_id: chat_id,
                tmdb_id: id,
                title: title || name || original_title || original_name,
                number_of_seasons: number_of_seasons,
                type: media_type,
                release_date: release_date || first_air_date,
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
