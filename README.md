[![Coverage Status](https://coveralls.io/repos/holidayextras/jsonapi-store-elasticsearch/badge.svg?branch=master&service=github)](https://coveralls.io/github/holidayextras/jsonapi-store-elasticsearch?branch=master)
[![Build Status](https://travis-ci.org/holidayextras/jsonapi-store-elasticsearch.svg?branch=master)](https://travis-ci.org/holidayextras/jsonapi-store-elasticsearch)
[![npm version](https://badge.fury.io/js/jsonapi-store-elasticsearch.svg)](http://badge.fury.io/js/jsonapi-store-elasticsearch)
[![Code Climate](https://codeclimate.com/github/holidayextras/jsonapi-store-elasticsearch/badges/gpa.svg)](https://codeclimate.com/github/holidayextras/jsonapi-store-elasticsearch)
[![Dependencies Status](https://david-dm.org/holidayextras/jsonapi-store-elasticsearch.svg)](https://david-dm.org/holidayextras/jsonapi-store-elasticsearch)


# jsonapi-store-elasticsearch

[![Greenkeeper badge](https://badges.greenkeeper.io/holidayextras/jsonapi-store-elasticsearch.svg)](https://greenkeeper.io/)

`jsonapi-server-elasticsearch` is a Elasticsearch backed data store for [`jsonapi-server`](https://github.com/holidayextras/jsonapi-server).

This project conforms to the specification laid out in the [jsonapi-server handler documentation](https://github.com/holidayextras/jsonapi-server/blob/master/documentation/handlers.md).

### Usage

```javascript
var ElasticsearchStore = require("jsonapi-store-elasticsearch");

jsonApi.define({
  resource: "comments",
  handlers: new ElasticsearchStore({
    host: "localhost:9200"
  })
});
```

### Features

 * Search, Find, Create, Delete, Update
 * Filtering, Sorting, Pagination

### Getting to Production

Getting this data store to production isn't too bad...

1. Bring up your Elasticsearch stack.
2. Create an index, give it a sensible name.
3. Create an alias for your index to the name "jsonapi".
4. Create the mapping for your resource. If you rely on the automatic mapping, you won't be able to sort on any attributes, and thus pagination won't work either.
5. Deploy your code.
6. Celebrate.

You'll probably want to override this handler's `search` functionality in order to achieve high-performance queries. That may look something like this:
```javascript
var efficientHandler = new ElasticsearchStore({
  host: "localhost:9200"
});
// the next function correlates with the jsonapi-server handler documentation:
// https://github.com/holidayextras/jsonapi-server/blob/master/documentation/handlers.md
efficientHandler.search = function(request, callback) {
  // within this scope, this._db is the Elasticsearch client
  var efficientQuery = buildAwesomeQuery();
  this._db.search(efficientQuery, callback);
};

jsonApi.define({
  resource: "comments",
  handlers: efficientHandler
});
```

When making schema changes...

If you are only adding new attributes, you can push in a mapping for the new attribute, deploy your code changes and celebrate.

If you are making destructive changes, you'll need to create a new index, add a fresh mapping, migrate data into it and finally swap the "jsonapi" alias to point to your new index. You can read this section on how to switch aliases around: https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-aliases.html#indices-aliases
