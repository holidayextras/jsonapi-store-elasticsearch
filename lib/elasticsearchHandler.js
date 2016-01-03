"use strict";
var async = require("async");
var elasticsearch = require("elasticsearch");

var ElasticsearchStore = module.exports = function ElasticsearchStore() {
};

ElasticsearchStore.prototype.ready = false;
elasticsearch.resourcesToInitialise = [];

ElasticsearchStore.prototype._buildQuery = function(request) {
  var queryString = "type:" + request.params.type;
  if(request.params.relationships) {
    Object.keys(request.params.relationships).forEach(function(relationship) {
      queryString += " AND " + relationship + ".id:" + request.params.relationships[relationship];
    });
  }
  return queryString;
};

ElasticsearchStore.prototype._formatMetaData = function(partialResource, method) {
  var self = this;
  for(var key in partialResource) {
    if(key === "meta") {
      partialResource[key] = JSON[method](partialResource[key] || {});
    }
    if(!(partialResource[key] instanceof Array) && (partialResource[key] instanceof Object)) {
      self._formatMetaData(partialResource[key], method);
    }
  }
  return partialResource;
};


ElasticsearchStore.prototype.populate = function(callback) {
  var self = this;
  self._db.indices.delete({ index: "_all" }, function(err) {
    if (err) return console.error("Error dropping index");
    async.each(self.resourceConfig.examples, function(document, cb) {
      self.create({ params: { type: document.type } }, document, cb);
    }, function(error) {
      if (error) console.error("error creating example resource");
      return callback();
    });
  });
};

/**
  initialise gets invoked once for each resource that uses this hander.
 */
ElasticsearchStore.prototype.initialise = function(resourceConfig) {
  var self = this;
  var clientConfig = {
    host: "http://localhost:9200"
  };
  var client = new elasticsearch.Client(JSON.parse(JSON.stringify(clientConfig)));
  if (!client) {
    console.error("error connecting to Elasticsearch");
  } else {
    self._db = client;
  }
  self.resourceConfig = resourceConfig;
  if (!self._db) {
    return elasticsearch.resourcesToInitialise.push(resourceConfig);
  }
  self.ready = true;
};

/**
  Create (store) a new resource give a resource type and an object.
 */
ElasticsearchStore.prototype.create = function(request, newResource, callback) {
  var self = this;
  newResource = self._formatMetaData(newResource, "stringify");
  self._db.index({
    index: "jsonapi",
    type: newResource.type,
    id: newResource.id,
    body: newResource,
    refresh: true
  }, function(err) {
    if (err) {
      return callback({
        status: "404",
        code: "ENOTFOUND",
        title: "Requested resource could not be created",
        detail: "Failed to create " + request.params.type + " with id " + newResource.id
      });
    }
    return callback(null, self._formatMetaData(newResource, "parse"));
  });
};

/**
  Find a specific resource, given a resource type and and id.
 */
ElasticsearchStore.prototype.find = function(request, callback) {
  var self = this;
  self._db.get({
    index: "jsonapi",
    type: request.params.type,
    id: request.params.id
  }, function(err, theResource) {
    if (err || !theResource) {
      return callback({
        status: "404",
        code: "ENOTFOUND",
        title: "Requested resource does not exist",
        detail: "There is no " + request.params.type + " with id " + request.params.id
      });
    }
    var test = self._formatMetaData(theResource._source, "parse");
    return callback(null, test);
  });
};

/**
  Search for a list of resources, give a resource type.
 */
ElasticsearchStore.prototype.search = function(request, callback) {
  var self = this;
  var params = {
    index: "jsonapi",
    q: self._buildQuery(request)
  };
  self._db.search(params, function(err, results) {
    if (err) return callback(err);
    results = results.hits.hits;
    if(!(results instanceof Array)) results = [results];
    results = results.map(function(result) {
      self._formatMetaData(result, "parse");
      return result._source;
    });
    return callback(null, results);
  });
};

/**
  Update a resource, given a resource type and id, along with a partialResource.
  partialResource contains a subset of changes that need to be merged over the original.
 */
ElasticsearchStore.prototype.update = function(request, partialResource, callback) {
  var self = this;
  self._db.index({
    index: "jsonapi",
    type: request.params.type,
    id: request.params.id,
    body: self._formatMetaData(partialResource, "stringify")
  }, function(err) {
    if (err) {
      return callback({
        status: "404",
        code: "ENOTFOUND",
        title: "Requested resource could not be updated",
        detail: "There is no " + request.params.type + " with id " + request.params.id
      });
    }
    return self.find(request, callback);
  });
};

/**
  Delete a resource, given a resource type and and id.
 */
ElasticsearchStore.prototype.delete = function(request, callback) {
  var self = this;
  self._db.delete({
    index: "jsonapi",
    type: request.params.type,
    id: request.params.id
  }, function(err, response) {
    if (err) {
      return callback({
        status: "404",
        code: "ENOTFOUND",
        title: "Requested resource could not be deleted",
        detail: "There is no " + request.params.type + " with id " + request.params.id
      });
    }
    return callback(null, response);
  });
};
