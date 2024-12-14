const { Pool, types } = require('pg');
const config = require('./config.json');

// Override the default parsing for BIGINT (PostgreSQL type ID 20)
types.setTypeParser(20, val => parseInt(val, 10)); //DO NOT DELETE THIS

// Create PostgreSQL connection using database credentials provided in config.json
// Do not edit. If the connection fails, make sure to check that config.json is filled out correctly
const connection = new Pool({
  host: config.rds_host,
  user: config.rds_user,
  password: config.rds_password,
  port: config.rds_port,
  database: config.rds_db,
  ssl: {
    rejectUnauthorized: false,
  },
});
connection.connect((err) => err && console.log(err));

// Creating user databases for security
connection.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL
  );
`, (err, result) => {
  if (err) {
    console.error('Error creating users table:', err);
  } else {
    console.log('Users table created or already exists');
  }
});

// Route 1: GET /avg_passing_yds_weather/:season
// Parameter: season - which particular NFL season we want to analyze
const avg_passing_yds_weather = async function (req, res) {

  const season = req.params.season; 

  connection.query(`
      SELECT
         CASE
             WHEN w.weather ILIKE '%rain%' OR w.weather ILIKE '%shower%' OR w.weather ILIKE '%drizzle%' OR w.weather ILIKE '%wet%' THEN 'Rainy'
             WHEN w.weather ILIKE '%snow%' OR w.weather ILIKE '%wintry%' OR w.weather ILIKE '%freezing%' OR w.weather ILIKE '%blizzard%' OR w.weather ILIKE '%flurries%' THEN 'Snowy'
             WHEN w.weather ILIKE '%fog%' OR w.weather ILIKE '%mist%' OR w.weather ILIKE '%haze%' THEN 'Foggy'
             WHEN w.weather ILIKE '%overcast%' OR w.weather ILIKE '%cloud%' OR w.weather ILIKE '%humid%' THEN 'Cloudy'
             WHEN w.weather ILIKE '%clear%' OR w.weather ILIKE '%fair%' OR w.weather ILIKE '%sun%' THEN 'Clear/Sunny'
             WHEN w.weather ILIKE '%wind%' OR w.weather ILIKE '%breezy%' THEN 'Windy'
             ELSE 'Other'
         END AS WeatherCondition,
         AVG(qb.passing_yards) AS AvgPassingYards
      FROM quarterback_stats qb
      JOIN weather_nfl_all_games_noplayoffs w
         ON qb.season = CAST(w.season AS INTEGER) AND qb.week = CAST(w.week AS INTEGER)
      WHERE qb.season = ${season}
      GROUP BY WeatherCondition
      HAVING COUNT(*) > 5
      ORDER BY AvgPassingYards DESC;
  `,
  (err, data) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Error: Query Failure.' });
    } else {
      res.json(data.rows);
    }
  }
);
};

// Route 2: GET /top_players/:num
// Parameter: num - the number of top players we want the query to return
const top_players = async function(req, res) {
  const num = req.params.num;

  connection.query(`
      SELECT ws.name, p.position, SUM(ws.fantasy_points) AS total_fantasy_points
      FROM weekly_stats ws
      JOIN players p ON ws.name = p.name
      GROUP BY ws.name, p.position
      ORDER BY total_fantasy_points DESC
      LIMIT '${num}'
    `,
    (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).json({ error: 'Error: Query Failure.' });
      } else {
        res.json(data.rows); 
      }
    }
  );
};


// Route 3: GET /adverse_weather_performance/:wind_speed/:limit
// Parameters: wind_speed - the minimum wind speed to look at, limit - how many players to return
const adverse_weather_performance = async function (req, res) {
  const windSpeed = req.params.wind_speed;
  const limit = req.params.limit; 

  connection.query(`
     WITH CategorizedGames AS (
        SELECT
            ws.name,
            CAST(ws.season AS INTEGER) AS season,
            CAST(ws.week AS INTEGER) AS week,
            ws.fantasy_points,
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM cachedwindygamesfinal wg
                    WHERE CAST(ws.season AS INTEGER) = wg.season AND CAST(ws.week AS INTEGER) = wg.week
                    AND wg.wind_speed >= ${windSpeed}
                ) THEN 'Windy'
                ELSE 'Normal'
            END AS Condition
        FROM weekly_stats ws
      ),
      PlayerPerformance AS (
        SELECT
            cg.name,
            cg.Condition,
            AVG(cg.fantasy_points) AS AvgFantasyPoints
        FROM CategorizedGames cg
        GROUP BY cg.name, cg.Condition
      ),
      PerformanceComparison AS (
        SELECT
            pp.name,
            MAX(CASE WHEN pp.Condition = 'Windy' THEN pp.AvgFantasyPoints ELSE NULL END) AS AvgFantasyWindy,
            MAX(CASE WHEN pp.Condition = 'Normal' THEN pp.AvgFantasyPoints ELSE NULL END) AS AvgFantasyNormal
        FROM PlayerPerformance pp
        GROUP BY pp.name
      )
      SELECT
          pc.name,
          pc.AvgFantasyWindy,
          pc.AvgFantasyNormal,
          (pc.AvgFantasyWindy - pc.AvgFantasyNormal) AS PerformanceDifference
      FROM PerformanceComparison pc
      WHERE pc.AvgFantasyWindy > pc.AvgFantasyNormal
      ORDER BY PerformanceDifference DESC
      LIMIT ${limit};
    `,
    (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).json({ error: 'Error: Query Failure.' });
      } else {
        res.json(data.rows);
      }
    }
  );
  };

// Route 4: GET /adverse_weather_team_comp/:teams
// Parameter: team - list of team abbreviations
const adverse_weather_team_comp = async function (req, res) {
  const teams = req.params.teams; 

    // Convert into an team names array
    const teamList = teams.split(',');
    
    // Wrap single quotes around teams for IN clause
    const teamsCompare = teamList.map(team => `'${team}'`).join(',');

  connection.query(`
  WITH AdverseWeather AS (
    SELECT DISTINCT
      CAST(w.season AS INTEGER) AS season,
      CAST(w.week AS INTEGER) AS week,
      w."Home Team",
      w."Away Team",
      CASE
        WHEN w.weather IN ('Rain', 'Snow') THEN 'Rain/Snow'
        WHEN w.temperature SIMILAR TO '[0-9]+ F' AND CAST(SPLIT_PART(w.temperature, ' ', 1) AS INTEGER) < 40 THEN 'Cold'
        WHEN w.wind SIMILAR TO '[0-9]+' AND CAST(w.wind AS INTEGER) > 20 THEN 'Windy'
        ELSE 'Normal'
      END AS WeatherCondition
    FROM weather_nfl_all_games_noplayoffs w
    WHERE w.weather IS NOT NULL
      AND w.temperature SIMILAR TO '[0-9]+ F'
      AND w.wind SIMILAR TO '[0-9]+'
  ),
  GameResults AS (
    SELECT
      CAST(w.season AS INTEGER) AS season,
      CAST(w.week AS INTEGER) AS week,
      w."Home Team" AS Team,
      (w."Home Team Score" - w."Away Team Score") AS Margin,
      COALESCE(aw.WeatherCondition, 'Normal') AS WeatherCondition
    FROM weather_nfl_all_games_noplayoffs w
    LEFT JOIN AdverseWeather aw
      ON CAST(w.season AS INTEGER) = aw.season
      AND CAST(w.week AS INTEGER) = aw.week
      AND w."Home Team" = aw."Home Team"
    UNION ALL
    SELECT
      CAST(w.season AS INTEGER) AS season,
      CAST(w.week AS INTEGER) AS week,
      w."Away Team" AS Team,
      (w."Away Team Score" - w."Home Team Score") AS Margin,
      COALESCE(aw.WeatherCondition, 'Normal') AS WeatherCondition
    FROM weather_nfl_all_games_noplayoffs w
    LEFT JOIN AdverseWeather aw
      ON CAST(w.season AS INTEGER) = aw.season
      AND CAST(w.week AS INTEGER) = aw.week
      AND w."Away Team" = aw."Away Team"
  ),
  TeamPerformanceByWeather AS (
    SELECT
      gr.Team,
      gr.WeatherCondition,
      AVG(gr.Margin) AS AvgMarginOfVictory
    FROM GameResults gr
    WHERE gr.Team IN (${teamsCompare})
    GROUP BY gr.Team, gr.WeatherCondition
  ),
  PerformanceComparison AS (
    SELECT
      tp.Team,
      COALESCE(MAX(CASE WHEN tp.WeatherCondition = 'Rain/Snow' THEN tp.AvgMarginOfVictory ELSE NULL END), 0) AS AvgMarginRainSnow,
      COALESCE(MAX(CASE WHEN tp.WeatherCondition = 'Cold' THEN tp.AvgMarginOfVictory ELSE NULL END), 0) AS AvgMarginCold,
      COALESCE(MAX(CASE WHEN tp.WeatherCondition = 'Windy' THEN tp.AvgMarginOfVictory ELSE NULL END), 0) AS AvgMarginWindy,
      COALESCE(MAX(CASE WHEN tp.WeatherCondition = 'Normal' THEN tp.AvgMarginOfVictory ELSE NULL END), 0) AS AvgMarginNormal
    FROM TeamPerformanceByWeather tp
    GROUP BY tp.Team
  )
  SELECT
    pc.Team,
    pc.AvgMarginRainSnow,
    pc.AvgMarginCold,
    pc.AvgMarginWindy,
    pc.AvgMarginNormal,
    (GREATEST(
        COALESCE(pc.AvgMarginRainSnow, 0),
        COALESCE(pc.AvgMarginCold, 0),
        COALESCE(pc.AvgMarginWindy, 0)
    ) - pc.AvgMarginNormal) AS PerformanceDifference
  FROM PerformanceComparison pc
  WHERE pc.AvgMarginNormal > 0
  ORDER BY PerformanceDifference DESC
  LIMIT 5;
    `,
    (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).json({ error: 'Error: Query Failure.' });
      } else {
        res.json(data.rows);
      }
    }
  );
  };

// Route 5: GET /cold_weather_qbs/:min_games
// Parameter min_games - no. games played in cold weather
const cold_weather_qbs = async function (req, res) {
  const minGames = req.params.min_games;

  connection.query(`
    SELECT
      ws.Name AS player_name,
      COUNT(*) AS games_played,
      AVG(qb.passer_rating) AS avg_rating,
      AVG(qb.passing_yards) AS avg_passing_yards,
      AVG(qb.passing_tds) AS avg_TDs
    FROM weekly_stats ws
    JOIN quarterback_stats qb
      ON ws.Name = qb.Name
      AND CAST(ws.Season AS TEXT) ~ '^[0-9]+$' AND CAST(qb.Season AS TEXT) ~ '^[0-9]+$'
      AND CAST(ws.Season AS INTEGER) = CAST(qb.Season AS INTEGER)
      AND CAST(ws.Week AS TEXT) ~ '^[0-9]+$' AND CAST(qb.Week AS TEXT) ~ '^[0-9]+$'
      AND CAST(ws.Week AS INTEGER) = CAST(qb.Week AS INTEGER)
    JOIN weather w
      ON CAST(ws.Season AS TEXT) ~ '^[0-9]+$' AND CAST(w.Season AS TEXT) ~ '^[0-9]+$'
      AND CAST(ws.Season AS INTEGER) = CAST(w.Season AS INTEGER)
      AND CAST(ws.Week AS TEXT) ~ '^[0-9]+$' AND CAST(w.Week AS TEXT) ~ '^[0-9]+$'
      AND CAST(ws.Week AS INTEGER) = CAST(w.Week AS INTEGER)
    WHERE w.Temperature ~ '^[0-9]+'
      AND CAST(REGEXP_REPLACE(w.Temperature, '[^0-9]', '', 'g') AS INTEGER) < 32
    GROUP BY ws.Name
    HAVING COUNT(*) >= ${minGames}
    ORDER BY avg_rating DESC;
    `,
    (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).json({ error: 'Error: Query Failure.' });
      } else {
        res.json(data.rows);
      }
    }
  );
  };

// Route 6: GET /goal_line_backs/:min_tds/:min_games
//Parameters: min_tds - minimum number of touchdowns, min_games - minimum played games
const goal_line_backs = async function (req, res) {
  const minTds = req.params.min_tds;
  const minGames = req.params.min_games;

  connection.query(`
       SELECT
           ws.Name AS player_name,
           ws.Season AS season,
           COUNT(*) AS games_played,
           SUM(rb.rushing_tds) AS TD_count,
           ROUND(AVG(rb.rushing_yards)::NUMERIC, 1) AS avg_rushing_yards,
           ROUND((SUM(rb.rushing_tds)::FLOAT / NULLIF(SUM(rb.rushing_yards), 0) * 100)::NUMERIC, 2) AS TED_100_yard
        FROM weekly_stats ws
        JOIN runningback_stats rb ON ws.Name = rb.Name
           AND ws.Season = rb.Season
           AND ws.Week = rb.Week
        WHERE rb.Carries >= 3
        GROUP BY ws.Name, ws.Season
        HAVING COUNT(*) >= ${minGames}
           AND SUM(rb.rushing_tds) >= ${minTds}
        ORDER BY td_per_100_yards DESC;
    `,
    (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).json({ error: 'Error: Query Failure.' });
      } else {
        res.json(data.rows);
      }
    }
  );
  };

// Route 7: GET /consistent_scorers/:position
// Parameter: position - the position we specifically want to analyze
const consistent_scorers = async function (req, res) {
  const position = req.query.position;
  
  connection.query(`
    SELECT
           ws.Name AS player_name,
           p.Position,
           COUNT(*) AS games_played,
           ROUND(AVG(ws.fantasy_points_ppr), 1) AS avg_points,
           ROUND(STDDEV(ws.fantasy_points_ppr), 2) AS point_variability,
           ROUND(MIN(ws.fantasy_points_ppr), 1) AS lowest_score,
           ROUND(MAX(ws.fantasy_points_ppr), 1) AS highest_score
        FROM weekly_stats ws
        JOIN players p ON ws.Name = p.name
        WHERE p.Position = '${position}'
        GROUP BY ws.Name, p.Position
        HAVING COUNT(*) >= 10
        ORDER BY
           p.Position,
           point_variability ASC,
           avg_points DESC;
 `,
 (err, data) => {
   if (err) {
     console.error(err);
     res.status(500).json({ error: 'Error: Query Failure.' });
   } else {
     res.json(data.rows);
   }
 }
);
};

// Route 8: GET /injury_resilience/:position
//Parameter: position - the player position we want to filter by
const injury_resilience = async function (req, res) {
  const position = req.params.position;

  connection.query(`
    SELECT
       ws.Name AS player_name,
       p.Position,
       COUNT(DISTINCT ws.Season) AS seasons_played,
       COUNT(DISTINCT CONCAT(ws.Season, '-', ws.Week)) AS total_games,
       COUNT(DISTINCT CONCAT(i.Season, '-', i.Week)) AS total_injuries,
       ROUND(
           (COUNT(DISTINCT CONCAT(i.Season, '-', i.Week))::FLOAT /
           NULLIF(COUNT(DISTINCT ws.Season), 0))::NUMERIC,
           2
       ) AS injuries_per_season
    FROM weekly_stats ws
    JOIN players p ON ws.Name = p.name
    LEFT JOIN Injuries i ON ws.Name = i.player
    ${position ? `WHERE p.Position = '${position}'` : ''}
    GROUP BY ws.Name, p.Position
    HAVING COUNT(DISTINCT CONCAT(ws.Season, '-', ws.Week)) >= 16
    ORDER BY injuries_per_season DESC, total_injuries DESC;
 `,
 (err, data) => {
   if (err) {
     console.error(err);
     res.status(500).json({ error: 'Error: Query Failure.' });
   } else {
     res.json(data.rows);
   }
 }
);
};

// Route 9: GET /player_performance_tiers/:position
// Parameter: position - the specific position we want to look at
const player_performance_tiers = async function (req, res) {
  const position = req.params.position;

  connection.query(`
      WITH PlayerStatVal AS (
        SELECT
          ws.Name AS player_name,
          ws.Season,
          ws.Position,
          AVG(ws.fantasy_points) AS avg_fantasy_points,
          SUM(ws.fantasy_points) AS total_fantasy_points
        FROM weekly_stats ws
        GROUP BY ws.Name, ws.Season, ws.Position
      ),
      PerformanceEachPos AS (
        SELECT
          qb.name,
          qb.season,
          qb.week,
          'QB' AS position,
          (qb.passing_yards * 0.04 + qb.passing_tds * 4 + qb.rushing_yards * 0.1 +
           qb.rushing_tds * 6 - qb.interceptions * 2) AS scoreval
        FROM quarterback_stats qb
        UNION ALL
        SELECT
          rb.name,
          rb.season,
          rb.week,
          'RB' AS position,
          (rb.rushing_yards * 0.1 + rb.rushing_tds * 6 + rb.receiving_yards * 0.1 +
           rb.receiving_tds * 6) AS scoreval
        FROM runningback_stats rb
        UNION ALL
        SELECT
          wo.name,
          wo.season,
          wo.week,
          'WR' AS position,
          (wo.receiving_yards * 0.1 + wo.receiving_tds * 6) AS scoreval
        FROM wideout_stats wo
      ),
      PerformanceDeviation AS (
        SELECT
          pe.name,
          pe.season,
          pe.position,
          AVG(pe.scoreval) AS avg_performance,
          STDDEV(pe.scoreval) AS performance_stddev
        FROM PerformanceEachPos pe
        GROUP BY pe.name, pe.season, pe.position
      ),
      PlayerLevelRat AS (
        SELECT
          pd.name,
          pd.season,
          pd.position,
          pd.avg_performance,
          pd.performance_stddev,
          psv.avg_fantasy_points,
          CASE pd.position
            WHEN 'QB' THEN
              CASE
                WHEN pd.avg_performance > 24 THEN 'Elite'
                WHEN pd.avg_performance > 20 THEN 'Above Average'
                WHEN pd.avg_performance > 15 THEN 'Average'
                ELSE 'Below Average'
              END
            WHEN 'RB' THEN
              CASE
                WHEN pd.avg_performance > 18 THEN 'Elite'
                WHEN pd.avg_performance > 14 THEN 'Above Average'
                WHEN pd.avg_performance > 10 THEN 'Average'
                ELSE 'Below Average'
              END
            WHEN 'WR' THEN
              CASE
                WHEN pd.avg_performance > 15 THEN 'Elite'
                WHEN pd.avg_performance > 12 THEN 'Above Average'
                WHEN pd.avg_performance > 8 THEN 'Average'
                ELSE 'Below Average'
              END
          END AS performance_tier
        FROM PerformanceDeviation pd
        LEFT JOIN PlayerStatVal psv
          ON pd.name = psv.player_name
          AND pd.season = psv.Season
      ),
      TopPlayers AS (
        SELECT *
        FROM PlayerLevelRat
        ORDER BY avg_performance DESC
        LIMIT 1100
      ),
      BetteringPlayer AS (
        SELECT
          name,
          season,
          position,
          avg_performance,
          performance_tier,
          LAG(avg_performance) OVER (
            PARTITION BY name
            ORDER BY season
          ) AS prev_performance
        FROM PlayerLevelRat
      ),
      Combining AS (
        SELECT
          pt.performance_tier,
          pt.position,
          AVG(pt.avg_performance) AS group_avg_performance,
          COUNT(*) AS player_count
        FROM TopPlayers pt
        GROUP BY pt.performance_tier, pt.position
      )
      SELECT
        plt.performance_tier,
        plt.position,
        COUNT(*) AS player_count,
        ROUND(AVG(plt.avg_performance)::numeric, 2) AS avg_tier_performance,
        ROUND(AVG(plt.performance_stddev)::numeric, 2) AS avg_performance_volatility,
        ROUND((AVG(plt.avg_performance) * COALESCE(cm.group_avg_performance, AVG(plt.avg_performance)))::numeric, 2) AS cross_calc,
        COALESCE(cm.player_count, COUNT(*)) AS comparison_count,
        ROUND(AVG(plt.avg_fantasy_points)::numeric, 2) AS avg_fantasy_points,
        STRING_AGG(DISTINCT CASE
          WHEN bp.avg_performance > bp.prev_performance THEN bp.name
        END, ', ') AS improved_players
      FROM PlayerLevelRat plt
      LEFT JOIN Combining cm
        ON plt.performance_tier = cm.performance_tier
        AND plt.position = cm.position
      LEFT JOIN BetteringPlayer bp
        ON plt.name = bp.name
        AND plt.season = bp.season
      WHERE plt.position = '${position}'
      AND CAST(plt.season AS INTEGER) >= 2018
      GROUP BY
        plt.performance_tier,
        plt.position,
        cm.group_avg_performance,
        cm.player_count
      HAVING COUNT(*) > 5
      ORDER BY
        plt.position,
        CASE
          WHEN plt.performance_tier = 'Elite' THEN 1
          WHEN plt.performance_tier = 'Above Average' THEN 2
          WHEN plt.performance_tier = 'Average' THEN 3
          ELSE 4
        END;
`,
(err, data) => {
if (err) {
  console.error(err);
  res.status(500).json({ error: 'Error: Query Failure.' });
} else {
  res.json(data.rows);
}
}
);
};

// Route 10: GET /injury_followup_probability/:number
// Parameter: number - the window size for looking at fog-related injuries
const injury_followup_probability = async function (req, res) {
  const windowNumber = req.params.windowNumber;

  connection.query(`
    WITH RECURSIVE mover AS (
        SELECT -${windowNumber} AS n
        UNION ALL
        SELECT n + 1 FROM mover WHERE n < ${windowNumber}
    ),
    weekslookat AS (
        SELECT
            n AS acceptablerange
        FROM mover
    ),
    injurytimes AS (
        SELECT DISTINCT  
            i.player,
            i.Season::text AS season,
            i.Week,
            EXISTS (
                SELECT 1
                FROM mv_foggy_conditions fc
                CROSS JOIN weekslookat ranging  
                WHERE fc.season = i.Season::text
                AND CAST(fc.week AS INTEGER) = i.Week + ranging.acceptablerange
                AND (i.Week + ranging.acceptablerange) >= 1
                AND (i.Week + ranging.acceptablerange) <= 18
            ) AS rainytime
        FROM injuries i
        WHERE i.Week IS NOT NULL
    ),
    valid_injuries AS (
        SELECT
            i.player,
            i.Season::text AS season,
            i.Week
        FROM injuries i
        JOIN injurytimes it ON
            i.player = it.player AND
            i.Season::text = it.season AND
            i.Week = it.Week
        WHERE i.game_status = 'Out'
        AND it.rainytime = TRUE
    ),
    playerswithi AS (
        SELECT
            i.player,
            COUNT(DISTINCT i.Season) AS injury_num,
            STRING_AGG(DISTINCT p.position, ',' ORDER BY p.position) AS positions
        FROM valid_injuries i
        LEFT JOIN players p ON i.player = p.name
        GROUP BY i.player
    ),
    following_injuries AS (
        SELECT
            i1.player,
            COUNT(DISTINCT i2.Season) AS following_injury_num
        FROM valid_injuries i1
        JOIN valid_injuries i2 ON i1.player = i2.player
            AND (i2.season > i1.season
                OR (i2.season = i1.season AND i2.Week > i1.Week))
        GROUP BY i1.player
    ),
    prob_calcs AS (
        SELECT
            (SELECT COUNT(DISTINCT name) FROM players) AS player_number,
            (
                SELECT COUNT(*)
                FROM playerswithi pi
                WHERE injury_num > 0
                AND EXISTS (
                    SELECT 1
                    FROM mv_foggy_conditions ws
                    WHERE ws.season IN (
                        SELECT DISTINCT season
                        FROM valid_injuries vi
                        WHERE vi.player = pi.player
                    )
                )
            ) AS injured_number,
            (
                SELECT COUNT(*)
                FROM following_injuries
                WHERE following_injury_num > 0
            ) AS injured_again
    )
    SELECT
        player_number,
        injured_number,
        injured_again,
        CAST(injured_number AS FLOAT) / NULLIF(player_number, 0) AS injury_prob,
        CAST(injured_again AS FLOAT) / NULLIF(injured_number, 0) AS another_injury_prob
    FROM prob_calcs;
 `,
 (err, data) => {
   if (err) {
     console.error(err);
     res.status(500).json({ error: 'Error: Query Failure.' });
   } else {
     res.json(data.rows);
   }
 }
);
};

//To create a new usernmame and password
const register = async function(req, res) {
  try {
    const { username, password } = req.body;
    const hashedPassword = await passwordHash(password);
    
    const query = `
      INSERT INTO users (username, password)
      VALUES ($1, $2)
      RETURNING id, username
    `;
    
    connection.query(query, [username, hashedPassword], (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed' });
      } else {
        res.json(data.rows[0]);
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

//Logging in to the system
const login = async function(req, res) {
  try {
    const { username, password } = req.body;
    
    const query = 'SELECT * FROM users WHERE username = $1';
    
    connection.query(query, [username], async (err, data) => {
      if (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
        return;
      }
      
      const user = data.rows[0];
      if (!user) {
        res.status(400).json({ error: 'User not found' });
        return;
      }
      
      const validPassword = await passwordCheck(password, user.password);
      if (!validPassword) {
        res.status(400).json({ error: 'Invalid password' });
        return;
      }
      
      res.json({ id: user.id, username: user.username });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  avg_passing_yds_weather,
  top_players,
  adverse_weather_performance,
  adverse_weather_team_comp,
  cold_weather_qbs,
  goal_line_backs,
  consistent_scorers,
  injury_resilience,
  player_performance_tiers,
  injury_followup_probability,
  register,
  login
}
