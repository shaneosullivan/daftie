let defaultOptions = { debug: false };

class Serializable {
  constructor(props) {
    this.properties = props || {};
  }

  toObject() {
    return this.properties;
  }

  toString() {
    return JSON.stringify(this.toObject());
  }

  toJSON() {
    return JSON.stringify(this.properties);
  }

  toQueryString() {
    var str = [];
    var obj = this.toObject();
    for (var p in obj) {
      if (obj.hasOwnProperty(p) && obj[p]) {
        str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
      }
    }
    return str.join("&");
  }
}

class Hit extends Serializable {
  constructor(props) {
    super(props);
    this.sent = false;
  }
}

class PageHit extends Hit {
  constructor(screenName) {
    super({ dp: screenName, t: "pageview" });
  }
}

class ScreenHit extends Hit {
  constructor(screenName) {
    super({ cd: screenName, t: "screenview" });
  }
}

class Event extends Hit {
  constructor(category, action, label, value) {
    super({ ec: category, ea: action, el: label, ev: value, t: "event" });
  }
}

class Analytics {
  constructor(propertyId, additionalParameters = {}, options = defaultOptions) {
    this.customDimensions = [];
    this.propertyId = propertyId;
    this.options = options;

    this.userAgent = window.navigator.userAgent;

    this.parameters = {
      ...additionalParameters
    };

    const storageKey = "analytics_id";

    this.waitOnPromise = new Promise((resolve, reject) => {
      chrome.storage.local.get([storageKey], result => {
        const clientId = result[storageKey];
        if (clientId) {
          this.clientId = clientId;
        } else {
          this.clientId = genClientID();
          const obj = {};
          obj[storageKey] = this.clientId;
          chrome.storage.local.set(obj);
        }
        resolve();
      });
    });
  }

  hit(hit) {
    // send only after the user agent is saved
    return this.send(hit);
  }

  event(event) {
    // send only after the user agent is saved
    return this.send(event);
  }

  addParameter(name, value) {
    this.parameters[name] = value;
  }

  addCustomDimension(index, value) {
    this.customDimensions[index] = value;
  }

  removeCustomDimension(index) {
    delete this.customDimensions[index];
  }

  send(hit) {
    /* format: https://www.google-analytics.com/collect? +
        * &tid= GA property ID (required)
        * &v= GA protocol version (always 1) (required)
        * &t= hit type (pageview / screenview)
        * &dp= page name (if hit type is pageview)
        * &cd= screen name (if hit type is screenview)
        * &cid= anonymous client ID (optional if uid is given)
        * &uid= user id (optional if cid is given)
        * &ua= user agent override
        * &an= app name (required for any of the other app parameters to work)
        * &aid= app id
        * &av= app version
        * &sr= screen resolution
        * &cd{n}= custom dimensions
        * &z= cache buster (prevent browsers from caching GET requests -- should always be last)
        */
    return this.waitOnPromise.then(() => {
      const customDimensions = this.customDimensions
        .map((value, index) => `cd${index}=${value}`)
        .join("&");

      const params = new Serializable(this.parameters).toQueryString();

      const url = `https://www.google-analytics.com/collect?tid=${
        this.propertyId
      }&v=1&cid=${
        this.clientId
      }&${hit.toQueryString()}&${params}&${customDimensions}&z=${Math.round(
        Math.random() * 1e8
      )}`;

      let options = {
        method: "get",
        headers: {
          "User-Agent": this.userAgent
        }
      };

      return fetch(url, options);
    });
  }
}

function genClientID() {
  return Date.now() + "_" + Math.floor(Math.random() * 1000);
}

const UaString = "UA-11032269-6";

const analytics = new Analytics(UaString);

function newEvent(category, action, label, value) {
  return new Event(category, action, label, value);
}

function sendEvent(category, action, label, value) {
  const evt = newEvent(category, action, label, value);
  analytics.event(evt);
}
