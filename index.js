const express = require('express');
const app = express();
const ProtoBuf = require('protobufjs');
const request = require('request-promise');
const moment = require('moment');

app.set('views', './views');
app.set('view engine', 'ejs');

var publicDb = {};
var feedMessage, directionMap;

app.get('/', (req, res) => {
  res.render(
    'index',
    {
      lineDisplayGroups: [
        [
          [ '1', '2', '3' ],
          [ '4', '5', '6' ],
          [ '7' ],
          [ 'G' ],
          [ 'L' ],
          [ 'J', 'Z' ]
        ],
        [
          ['A', 'C', 'E'],
          ['B', 'D', 'F', 'M'],
          ['N', 'Q', 'R', 'W']
        ]
      ],
      lines: publicDb
    }
  );
});

const collectRT = (body) => {
  return new Promise((resolve, reject) => {
    var trainDb = {};

    try {
      msg = feedMessage.decode(body);
    } catch (e) {
      console.error(e);
    }

    msg.entity.forEach((entity) => {
      if (!entity.tripUpdate) return;
      var nyctDescriptor = entity.tripUpdate.trip['.nyctTripDescriptor'];
      var line = nyctDescriptor.trainId.substring(1, 2);
      var direction = directionMap[nyctDescriptor.direction];

      entity.tripUpdate.stopTimeUpdate.forEach((stopTimeUpdate) => {
        var stopId = stopTimeUpdate.stopId.slice(0, -1);
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

        if (stopTimeUpdate.arrival && stopTimeUpdate.arrival.time) {
          time = stopTimeUpdate.arrival.time.low;
        } else if (stopTimeUpdate.departure && stopTimeUpdate.departure.time) {
          time = stopTimeUpdate.departure.time.low;
        } else {
          time = '';
        }

        trainDb[line][direction][stopId].push(moment.unix(time));
      });
    });

    resolve(trainDb);
  });
};

const processFeed = (apiKey, feedId) => {
  request({
    url: `http://datamine.mta.info/mta_esi.php?key=${apiKey}&feed_id=${feedId}`,
    encoding: null
  })
  .then(collectRT)
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

          trainDb[line][direction][stopId] =
            Math.round(waitTimes.reduce((a, b) => { return a + b; }, 0) / waitTimes.length);
        }

        var values = Object.values(trainDb[line][direction]);
        trainDb[line][direction] =
          Math.round(values.reduce((a, b) => { return a + b; }, 0) / values.length);
      }
    }
    publicDb = Object.assign({}, publicDb, trainDb);
  });
};

ProtoBuf
.load("nyct-subway.proto")
.then((root) => {
  return new Promise((resolve, reject) => {
    resolve([
      root.lookupType("FeedMessage"),
      root.lookupType("NyctTripDescriptor").nested.Direction.valuesById
    ]);
  });
})
.then((args) => {
  feedMessage = args[0];
  directionMap = args[1];

  app.locals.getStatusDescription = (time) => {
    if (time < 6) {
      return 'rapid';
    } else if (time < 12) {
      return 'frequent';
    } else {
      return 'degraded';
    }
  };

  app.listen(process.env.PORT || 3000, () => {
    for(var feedId of [1, 26, 16, 21, 2, 11, 31, 36, 51]) {
      processFeed(process.env.API_KEY, feedId);
    }

    console.log('App is listening');
  });
});
