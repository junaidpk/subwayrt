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
      var time;

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

const getStatusDescription = (time) => {
  if (time <= 6) {
    return 'Rapid';
  } else if (time <= 12) {
    return 'Frequent';
  } else {
    return 'Degraded';
  }
};

const getSum = (values) => {
  return Math.round(values.reduce((a, b) => { return a + b; }, 0) / values.length);
};

const lineCategories = [
  {
    name: "Degraded", desc: "Every 13+ mins" },
  { name: "Frequent", desc: "Every 6-12 mins" },
  { name: "Rapid", desc: "Every 6 mins or less" }
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
              var diff = sortedTimes[i].diff(sortedTimes[i-1], 'minutes')
              waitTimes.push(Math.abs(diff));
            }
          }

          trainDb[line][direction][stopId] = getSum(waitTimes);
        }

        trainDb[line][direction] = getSum(Object.values(trainDb[line][direction]));
      }
    }
    publicDb = Object.assign({}, publicDb, trainDb);
  });
};

const transformPublicDb = (db) => {
  var transformedDb = {};

  for(var line in db) {
    var desc = getStatusDescription(db[line].NORTH);

    if (!transformedDb[desc]) {
      transformedDb[desc] = {};
    }

    transformedDb[desc][line] = db[line];
  }

  return transformedDb;
};

loadProtobufAssets()
.then((args) => {
  feedMessage = args[0];
  directionMap = args[1];

  app.get('/', (req, res) => {
    res.render(
      'index',
      {
        lineCategories,
        lines: transformPublicDb(publicDb)
      }
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
