const db = require('mongoose')

const userSchema = new db.Schema({
    id: {
        type: String,
        unique: true
    },
    is_bot: Boolean,
    startDate: Date,
    first_name: String,
    username: String,
    lang: String,
    token: String,
    tokenMsg: Number,
    driveId: String,
})

module.exports = db.model('user', userSchema)
