const logger = require('../services/logger');




function authenticateLogin(req, res, next) {
    try {
        if (req.session.user_type === "university") next();
        else return res.redirect('/university/login');
    } catch (e) {
        next(e);
    }
}

function redirectToDashboardIfLoggedIn(req, res, next) {
    try {
        if (req.session.user_type === "university") return res.redirect('/university/dashboard');
        else next();
    } catch (e) {
        next(e);
    }
}


module.exports = { authenticateLogin, redirectToDashboardIfLoggedIn };



