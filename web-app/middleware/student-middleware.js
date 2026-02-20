const logger = require('../services/logger');

function authenticateLogin(req, res, next) {
    try {
        if (req.session.user_type === "student") next();
        else return res.redirect('/student/login');
    } catch (e) {
        next(e);
    }
}

function redirectToDashboardIfLoggedIn(req, res, next) {
    try {
        if (req.session.user_type === "student") return res.redirect('/student/dashboard');
        if (req.session.user_type === "university") return res.redirect('/university/dashboard');
        next();
    } catch (e) {
        next(e);
    }
}

module.exports = { redirectToDashboardIfLoggedIn, authenticateLogin };