const express = require('express');
const cors = require('cors');
const config = require('./config');
const routes = require('./routes');

const app = express();
app.use(cors({
  origin: '*',
}));

// We use express to define our various API endpoints and
// provide their handlers that we implemented in routes.js

// API Endpoints
// Route 1
app.get('/average_stats/:weather_condition', routes.average_stats);
// Route 2
app.get('/top_players/:num', routes.top_players);
// Route 3
app.get('/adverse_weather_performance/:limit', routes.adverse_weather_performance);
// Route 4
app.get('/injury_probability/:season', routes.injury_probability);
// Route 5
app.get('/cold_weather_qbs/:min_games', routes.cold_weather_qbs);
// Route 6
app.get('/goal_line_backs/:min_tds/:min_games', routes.goal_line_backs);
// Route 7
app.get('/consistent_scorers/:position', routes.consistent_scorers);
// Route 8
app.get('/injury_resilience/:position', routes.injury_resilience);
// Route 9
app.get('/player_performance_tiers/:position', routes.player_performance_tier);
// Route 10
app.get('/injury_followup_probability/:min_seasons', routes.injury_followup_probability);
 
app.listen(config.server_port, () => {
  console.log(`Server running at http://${config.server_host}:${config.server_port}/`)
});

module.exports = app;


