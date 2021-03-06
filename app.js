var express = require('express')
  , passport = require('passport')
  , util = require('util')
  , GoogleStrategy = require('passport-google-oauth').OAuth2Strategy
  , morgan = require('morgan')
  , cookieParser = require('cookie-parser')
  , bodyParser = require('body-parser')
  , methodOverride = require('method-override')
  , session = require('express-session')
  , pg = require('pg')
  , request = require('request');


// API Access link for creating client ID and secret:
// https://code.google.com/apis/console/
var GOOGLE_CLIENT_ID = "455799677573-amcqb0g21bl9dp366dic577dfun1e3hu.apps.googleusercontent.com";
var GOOGLE_CLIENT_SECRET = "xoik4agybVoQJFG1q8zXdBd1";


// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Google profile is
//   serialized and deserialized.
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});


// Use the GoogleStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and Google
//   profile), and invoke a callback with a user object.
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    // asynchronous verification, for effect...
    process.nextTick(function () {
      
      // To keep the example simple, the user's Google profile is returned to
      // represent the logged-in user.  In a typical application, you would want
      // to associate the Google account with a user record in your database,
      // and return that user instead.
      return done(null, profile);
    });
  }
));




var app = express();

// configure Express
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(morgan('dev'));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(methodOverride());
app.use(session({ secret: 'keyboard cat' }));
// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname + '/public'));


app.get('/', function(req, res){
  res.render('index', { user: req.user });
});

app.get('/account', ensureAuthenticated, function(req, res){
  res.render('account', { user: req.user });
});

app.get('/taskboard', ensureAuthenticated, function(req, res){
  res.render('taskboard', { user: req.user });
});

app.get('/posts', ensureAuthenticated, function(req, res){
  var query = "select * from posts where id = '" + req.user.id + "'";

  runQuery(query, function(result) {
    res.json(result.rows);
  });
});



app.post('/getImages', ensureAuthenticated, function(req, res){
  for(var i in req.body) {
    break;
  }
  console.log(i);

  request(i, function (error, response, body) {
    var results = [];

    if (!error && response.statusCode == 200) {
      var imgs = body.match(/<img.*?>/g);

      var count = 0;
      for(var a = 0; a < imgs.length; a++) {
        try {
          var imgUrl = imgs[a].match(/src.*?=.*?('|").*?('|")/)[0].match(/('|").*?('|")/)[0];
          imgUrl = imgUrl.substring(1, imgUrl.length-1);

          console.log(imgUrl);
          results.push(imgUrl);

          count++;
          if(count > 4) {
            break;
          }
        } catch(e) {

        }
      }
    } else {
      console.log('crap');
    }

    res.send(results);
  });
  
});

app.get('/createPost', ensureAuthenticated, function(req, res){
  res.render('createPost', { user: req.user });
});

app.post('/createPost', ensureAuthenticated, function(req, res){
  console.log(req.body);
  
  var query = 
    "insert into posts values ('" 
      + req.user.id + "', '" 
      + req.body.title + "', '"
      + req.body.url + "', date '"
      + req.body.endDate + "')";

  runQuery(query);
  res.send(req.body);
});

app.get('/login', function(req, res){
  res.render('login', { user: req.user });
});

app.get('/header', function(req, res){
  res.render('header', { user: req.user });
});

app.get('/footer', function(req, res){
  res.render('footer', { user: req.user });
});

// GET /auth/google
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Google authentication will involve
//   redirecting the user to google.com.  After authorization, Google
//   will redirect the user back to this application at /auth/google/callback
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile'] }),
  function(req, res){
    // The request will be redirected to Google for authentication, so this
    // function will not be called.
  });

// GET /auth/google/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    runQuery('select * from users where id = \'' + req.user.id +'\'', function(result) {
      if(result.rows.length === 0) {
        console.log('user not found adding user to the db');
        runQuery('insert into users values (\''+ req.user.id + '\');');
      }
    });
    res.redirect('/');
  });

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

console.log(process.env.DATABASE_URL);
// If no port then we are on local
if(!process.env.PORT) {
  process.env.DATABASE_URL += '?ssl=true';
}

app.get('/db', function (request, response) {
  pg.connect(process.env.DATABASE_URL, function(err, client, done) {
    console.log(err);

    client.query('SELECT * FROM users', function(err, result) {
      done();
      if (err)
       { console.error(err); response.send("Error " + err); }
      else
       { response.send(result.rows); }
    });
  });
})

app.listen(process.env.PORT || 3000);


// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/');
}

function runQuery(str, callback) {
  pg.connect(process.env.DATABASE_URL, function(err, client, done) {
    console.log(err);

    client.query(str, function(err, result) {
      done();
      if (err) {
        console.error(err);
      }
      else if(callback) { 
        callback(result);
      }
    });
  });
}
