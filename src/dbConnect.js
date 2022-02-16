const db = require('mongoose')

exports.dbConnect =  async () => {
    const {MONGO} = process.env;
    await (db.connect(MONGO))
        .then(() => {
            console.log('DB connected')
        })
        .catch((error) => {
            console.log('error: ', error.message)
        })
}