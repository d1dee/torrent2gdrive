const db = require('mongoose')

exports.dbConnect = () => {
    return new Promise((resolve, reject) => {
        const {MONGO} = process.env;
        db.connect(MONGO)
            .then((docs) => {
                resolve(docs)
            })
            .catch((error) => {
                reject(error)
            })
    })
}