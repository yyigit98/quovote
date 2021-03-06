var createError = require('http-errors');
var express = require('express');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);

const { mongoose } = require('./bootstrap');

var indexRouter = require('./routes/index');

var app = express();

app.use(session({
  store: new MongoStore({ mongooseConnection: mongoose.connection }),
  secret: 'thisissupposedtobeasecret'
}));

// view engine setup
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/api', indexRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.send(req.app.get('env') === 'development' ? err.stack : err.message);
});

module.exports = app;
