# subwayrt

Provides a real-time snapshot of service on the NYC Subway every thirty
seconds. Lines are grouped into the following three categories:

- "Degraded" (Every 13+ mins)
- "Frequent" (Every 6-12 mins)
- "Rapid" (Every 6 mins or less)

Averages are taken of GTFS-RT stop time updates for every line and
direction.

### Usage

Create an `.env` file with an `API_KEY` variable, which can be created
from [the MTA](https://datamine.mta.info).

Run the server:

```
yarn install
yarn run start
```

### License

Copyright (c) 2018+ Jon Moss under the MIT License.
