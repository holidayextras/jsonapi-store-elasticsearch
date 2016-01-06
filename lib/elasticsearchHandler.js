"use strict";
var ElasticsearchStore = module.exports = function ElasticsearchStore() { };

var async = require("async");
var debug = require("debug")("jsonApi:store:elasticsearch");
var elasticsearch = require("elasticsearch");
var _ = {
  assign: require("lodash.assign")
};


ElasticsearchStore.prototype.ready = false;

ElasticsearchStore.prototype._buildQuery = function(request) {
  var self = this;

  var queryString = "type:" + request.params.type;
  if (!request.params.filter) return queryString;

  queryString = "(" + queryString + ")";
  var filterString = Object.keys(request.params.filter).map(function(attribute) {
    var attributeConfig = self.resourceConfig.attributes[attribute];
    // If the filter attribute doens't exist, skip it
    if (!attributeConfig) return null;

    var values = request.params.filter[attribute];
    if (!values) return null;

    // Relationships need to be queried via .id
    if (attributeConfig._settings) {
      attribute += ".id";
      // Filters on nested resources should be skipped
      if (values instanceof Object) return null;
    }

    // Coerce values to an array to simplify the logic
    values = [].concat(values);
    values = values.map(function(value) {
      if (value[0] === ":" || (value[0] === "~")) return value.substring(1);
      return value;
    }).join(" OR ");

    return attribute + ":(" + values + ")";
  }).filter(function(value) {
    return value !== null;
  });
  if (filterString.length > 0) {
    queryString += " AND (" + filterString.join(") AND (") + ")";
  }

  return queryString;
};

ElasticsearchStore.prototype._applySort = function(request) {
  if (!request.params.sort) return { };

  var attribute = request.params.sort;
  var order = "asc";
  attribute = String(attribute);
  if (attribute[0] === "-") {
    order = "desc";
    attribute = attribute.substring(1, attribute.length);
  }
  var sortParam = {
    sort: attribute + ".raw:" + order
  };

  return sortParam;
};


ElasticsearchStore.prototype._applyPagination = function(request) {
  if (!request.params.page) return { };

  var page = {
    size: request.params.page.limit,
    from: request.params.page.offset
  };

  return page;
};

ElasticsearchStore.prototype._generateMappingFor = function(resourceConfig) {
  var mapping = { properties: {
    id: {
      type: "string"
    },
    type: {
      type: "string"
    }
  } };

  Object.keys(resourceConfig.attributes).forEach(function(attributeName) {
    if (attributeName === "type" || attributeName === "id") return;
    var attribute = resourceConfig.attributes[attributeName];

    if (attribute._settings) {
      mapping.properties[attributeName] = {
        properties: {
          id: {
            type: "string"
          },
          type: {
            type: "string",
            index: "not_analyzed"
          }
        }
      };
    } else {
      var type = attribute._type;
      if (type === "object") return;
      if (type === "number") type = "integer";
      mapping.properties[attributeName] = {
        type: type,
        fields: {
          raw: {
            type: type,
            index: "not_analyzed"
          }
        }
      };
    }
  });

  var result = { };
  result[resourceConfig.resource] = mapping;
  return result;
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
  self.ready = true;
};

ElasticsearchStore.prototype.populate = function(callback) {
  var self = this;
  self._db.indices.delete({ index: "jsonapi" }, function(err) {
    if (err) console.log("Error dropping index?", err.message);

    self._db.indices.create({ index: "jsonapi" }, function(err1) {
      if (err1) console.log("Error creating index?", err1);

      var mappingRequest = {
        index: "jsonapi",
        type: self.resourceConfig.resource,
        body: self._generateMappingFor(self.resourceConfig)
      };
      self._db.indices.putMapping(mappingRequest, function(err2) {
        if (err2) console.log("Error adding mapping?", err2);

        async.each(self.resourceConfig.examples, function(document, cb) {
          self.create({ params: { type: document.type } }, document, cb);
        }, function(error) {
          if (error) console.error("error creating example resource");
          return callback();
        });
      });
    });
  });
  return self;
};

/**
  Create (store) a new resource give a resource type and an object.
 */
ElasticsearchStore.prototype.create = function(request, newResource, callback) {
  var self = this;
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
    return callback(null, newResource);
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

    debug("find", JSON.stringify(theResource._source));
    return callback(null, theResource._source);
  });
};

/**
  Search for a list of resources, give a resource type.
 */
ElasticsearchStore.prototype.search = function(request, callback) {
  var self = this;
  var params = _.assign({
    index: "jsonapi",
    q: self._buildQuery(request)
  }, self._applyPagination(request), self._applySort(request));

  debug("search", JSON.stringify(params));
  async.parallel({
    resultSet: function(asyncCallback) {
      self._db.search(params, asyncCallback);
    },
    totalRows: function(asyncCallback) {
      self._db.count(params, asyncCallback);
    }
  }, function(err, results) {
    if (err) {
      debug("err", err);
      return callback(err);
    }

    var totalRows = results.totalRows[0].count;

    results = results.resultSet[0].hits.hits;
    if(!(results instanceof Array)) results = [results];
    results = results.map(function(result) {
      return result._source;
    });

    debug("search", JSON.stringify(results));
    return callback(err, results, totalRows);
  });
};

/**
  Update a resource, given a resource type and id, along with a partialResource.
  partialResource contains a subset of changes that need to be merged over the original.
 */
ElasticsearchStore.prototype.update = function(request, partialResource, callback) {
  var self = this;
  self.find(request, function(err, theResource) {
    if (err) {
      return callback({
        status: "404",
        code: "ENOTFOUND",
        title: "Requested resource could not be updated",
        detail: "There is no " + request.params.type + " with id " + request.params.id
      });
    }

    theResource = _.assign(theResource, partialResource);
    self.create(request, theResource, function(err2) {
      if (err2) {
        return callback({
          status: "404",
          code: "ENOTFOUND",
          title: "Requested resource could not be updated",
          detail: "There is no " + request.params.type + " with id " + request.params.id
        });
      }
      return self.find(request, callback);
    });
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
