require('dotenv').config();

const express = require('express');
const app = express();
const { getFeeds, loadProtobufAssets, processProtobuf } = require('nyc-gtfs-utils');

app.set('views', './views');
app.set('view engine', 'ejs');

var publicDb = {};
var feedMessage, directionMap;

const collectRT = (body) => {
  var trainDb = {};

  return processProtobuf(
    feedMessage, directionMap, body,
    () => {},
    ({ trainId, direction, stopId, time }) => {
      var line = trainId.substring(1, 2);
      if (stopId.startsWith('S')) {
        line = 'SI';
      }

      if (!trainDb[line]) {
        trainDb[line] = {};
      }

      if (!trainDb[line][direction]) {
        trainDb[line][direction] = {};
      }

      if (!trainDb[line][direction][stopId]) {
        trainDb[line][direction][stopId] = [];
      }

      trainDb[line][direction][stopId].push(time);
    }
  ).then(() => {
    return new Promise((resolve, reject) => {
      resolve(trainDb);
    });
  });
};

const getAverage = (values) => {
  return Math.round(values.reduce((a, b) => { return a + b; }, 0) / values.length);
};

const getStatusDescription = (time) => {
  if (time <= 6) {
    return 'Rapid';
  } else if (time <= 12) {
    return 'Frequent';
  } else {
    return 'Degraded';
  }
};

const lineCategories = [
  { name: "Degraded", amount: Infinity, desc: "Every 13+ mins" },
  { name: "Frequent", amount: 12, desc: "Every 6-12 mins" },
  { name: "Rapid", amount: 6, desc: "Every 6 mins or less" }
];

const processFeed = (...args) => {
  return collectRT(...args)
  .then((trainDb) => {
    for(var line in trainDb) {
      for(var direction in trainDb[line]) {
        for(var stopId in trainDb[line][direction]) {
          var waitTimes = [];
          var sortedTimes = trainDb[line][direction][stopId].sort();

          if (sortedTimes.length === 0) {
            waitTimes = [0];
          } else if (sortedTimes.length === 1) {
            waitTimes = [
              sortedTimes[0].minutes()
            ];
          } else {
            for(var i = 1; i < sortedTimes.length; i++) {
              waitTimes.push(Math.abs(
                sortedTimes[i].diff(sortedTimes[i-1], 'minutes')
              ));
            }
          }

          trainDb[line][direction][stopId] = getAverage(waitTimes);
        }

        trainDb[line][direction] = getAverage(Object.values(trainDb[line][direction]));
      }
    }
    publicDb = Object.assign({}, publicDb, trainDb);
  });
};

const transformPublicDb = (db) => {
  return Object.keys(db).reduce((prev, line) => {
    var desc = getStatusDescription(db[line].NORTH);
    prev[desc][line] = db[line];
    return prev;
  }, lineCategories.reduce((prev, cat) => { prev[cat.name] = {}; return prev; }, {}));
};

loadProtobufAssets()
.then((args) => {
  feedMessage = args[0];
  directionMap = args[1];

  app.get('/', (req, res) => {
    res.render(
      'index',
      { lineCategories, lines: transformPublicDb(publicDb) }
    );
  });

  app.get('/ping', (req, res) => {
    res.status(200).end();
  });

  app.listen(process.env.PORT || 3000, () => {
    //setInterval(() => {
      getFeeds(process.env.API_KEY, processFeed);
    //}, 30000);

    console.log('App is listening');
  });
});
