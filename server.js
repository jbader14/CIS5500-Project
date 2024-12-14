const express = require('express');
const cors = require('cors');
const config = require('./config');
const routes = require('./routes');
const https = require('https');
const auth = require('./auth');

const app = express();
app.use(cors({
  origin: '*',
}));

app.use(express.json());

//Adding a privacy mode for viewing
const checkPrivacyMode = (req, res, next) => {
  const isPrivate = req.headers['x-privacy-mode'] === 'true';
  req.isPrivateMode = isPrivate;
  next();
};

app.use(checkPrivacyMode);

// We use express to define our various API endpoints and
// provide their handlers that we implemented in routes.js

// API Endpoints
// Route 1
app.get('/avg_passing_yds_weather/:season', routes.avg_passing_yds_weather);
// Route 2
app.get('/top_players/:num', routes.top_players);
// Route 3
app.get('/adverse_weather_performance/:wind_speed/:limit', routes.adverse_weather_performance);
// Route 4
app.get('/adverse_weather_team_comp/:teams', routes.adverse_weather_team_comp);
// Route 5
app.get('/cold_weather_qbs/:min_games', routes.cold_weather_qbs);
// Route 6
app.get('/goal_line_backs/:min_tds/:min_games', routes.goal_line_backs);
// Route 7
app.get('/consistent_scorers/:position', routes.consistent_scorers);
// Route 8
app.get('/injury_resilience/:position', routes.injury_resilience);
// Route 9
app.get('/player_performance_tiers/:position', routes.player_performance_tiers);
// Route 10
app.get('/injury_followup_probability/:windowNumber', routes.injury_followup_probability);
// Register
app.post('/register', routes.register);
// Login
app.post('/login', routes.login);

//https.createServer(auth.sslOptions, app).listen(443, () => {
//  console.log('Secure server running on port 443');
//});
 
app.listen(config.server_port, () => {
  console.log(`Server running at http://${config.server_host}:${config.server_port}/`)
});

module.exports = app;


