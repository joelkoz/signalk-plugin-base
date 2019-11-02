"use strict";

/**
 * Base class for creating a SignalK Node Server plugin. This class provides
 * basic behaviors desireable to all plugins.
 */
class SignalKPlugin {

    /**
     * Constuctor for the base SignalK Plugin class. This may be called the normal way by using 
     * parameter positions to specify the plugin definition, 
     * or alternatively using a pseudo 'call by name' where
     * the first parameter is an object, and each property name of the object matches
     * the corresponding parameter name.
     * @param {object} app The ExpressJS app object that was passed from the SignalK server to the plugin factory function
     * @param {string} id Uniquely identifies this plugin. Usually in the form "signalk-some-plugin"
     * @param {string} name Human readable name/title of this plugin
     * @param {string} description A brief description of what this plugin does
     */
    constructor(app, id, name, description) {

        if (app.hasOwnProperty('app') && typeof id === 'undefined') {
            ({app, id, name, description} = app);
        }

        this.app = app;
        this.id = id;
        this.name = name;
        this.description = description;
        this._schema = { type: "object", properties: {} };
        this._optContainers = [ this._schema.properties ];
        this.unsub = [];
    }


    /** 
     * Returns the current time in milliseconds. Call this
     * whenever the current time is needed. External unit tests
     * may monkey patch this method to return a simulated time of
     * day while the tests are running.
     */
    getTime() {
      return new Date().getTime();
    }


    /**
     * Called when the plugin starts. Descendant classes can override, but
     * should call super.start() if they do. Overriding is normally not necessary
     * as extensions to this method are generally placed in onPluginStarted()
     * @see onPluginStarted
     */
    start(options, restartPlugin) {
        this.startedOn = -1;

        this.unsub = [];

        this.running = true;
        this.restartPlugin = restartPlugin;
    
        // Here we put our plugin logic
        this.debug(`${this.name} plugin starting...`);
        this.setStatus("Starting...");
    
        this._setDefaultOptions(options);
        this.debug(`Options: ${JSON.stringify(options)}`);
        this.options = options;

        this.dataDir = this.app.getDataDirPath();
        this.debug(`Data dir path is ${this.dataDir}`);
    
        this.onPluginStarted();

        this.debug(`${this.name} started`);
        this.startedOn = this.getTime();
    }


    /**
     * Called once the plugin has started and all options have been resolved.  Normally, this
     * creates the BaconJS data streams and properties used by this plugin and subscribes
     * to them.
     * @see start
     */
    onPluginStarted() {
        this.debug('WARNING: No data streams defined. onPluginStarted() should be overridden.');
    }    


    /**
     * Called when the plugin stops.  Cleanup occurs here, including
     * unsubscribing from any data paths. If you override this, be
     * sure to call super.stop(). Extensions are usually instead
     * placed in onPluginStopped().
     * @see onPluginStopped
     */
    stop() {
        if (!this.running) {
            // Ignore calls to stop() if we are already stopped();
            return;
        }
        this.running = false;
        this.debug(`${this.name} stopping`);
        this.unsub.forEach(f => f());
        this.unsub = [];

        this.onPluginStopped();

        this.setStatus("Stopped");
        this.debug(`${this.name} stopped`);
        this.startedOn = -1;
    }


    /**
     * Restarts this plugin by calling the "restartPlugin" function that was
     * passed to the start() method.
     */
    restart() {
        if (this.restartPlugin) {
            this.restartPlugin();
        }
    }


   /**
    * Called when the plugin is to stop running.
    * @see stop
    */
    onPluginStopped() {
    }


    /**
     * Sets the status of this plugin, placing msg on the server admin app.
     * @param {string} msg 
     */
    setStatus(msg) {
        this.app.setProviderStatus(msg);
    }
    

   /**
     * Used to indicate an error has occurred in the pluging. The specified msg
     * will appear on the server admin app
     * @param {string} msg 
     */
    setError(msg) {
        this.app.setProviderError(msg);
    }

    
    
    /**
     * Returns a BaconJS stream that produces the deltas for the specified
     * SignalK path. If allContexts is specified as TRUE, the bus will
     * be for ALL contexts. Otherwise, that data will be restricted to
     * "self" (i.e. data for the boat's "self" context)
     * @param {string} skPath The SK path to receive, or unspecified for ALL data
     * @param {boolean} [allContexts=false] TRUE to get ALL vessels data. unspecified or FALSE implies
     *   you want just the data for the current vessel.
     */
    getSKBus(skPath, allContexts) {
         if (allContexts) {
            return this.app.streambundle.getBus(skPath);
         }
         else {
            return this.app.streambundle.getSelfBus(skPath);
         }
    }
    
    
    /**
     * Similar to getSKBus() except the data producsed by the BaconJS stream
     * will be limited to the "value" property of the data, vs. the entire delta.
     * @param {string} skPath The SK path to receive, or unspecified for ALL data
     */
    getSKValues(skPath) {
          return this.app.streambundle.getSelfStream(skPath);
    } 

    

    /**
     * 'Subscribes' function f to the stream strm, adding its 'unsubscribe' function
     * to the unsub list.
     * @param {Bacon.Stream} strm 
     * @param {function} f Any function or method from an object. If f is a method
     *   from an object other than 'this', be sure to pass the self parameter.
     * @param {object} [self=this] Option parameter to specify the 'this' object that
     *    f should be bound to. Self must be specified if f is a method of an object
     *    other than 'this' plugin object.
     */
    subscribeVal(strm, f, self) {

        if (!self) {
            self = this;
        }

        this.unsub.push(strm.onValue(f.bind(self)));
    }
    

    
    /**
     * Sends a single value SignalK delta thru the server and out to all external
     * subscribers. To send more than one value at a time, use sendSKValues()
     * @param {string} skPath The SignalK path that corresponds to the value
     * @param {any} value The actual value to send out
     * @see #sendSKValues
     */
    sendSK(skPath, value) {
        let values = [];
    
        values.push({ path: skPath, value });
    
        this.sendSKValues(values);
    }
    
    
    
    /**
     * Sends the specified array of path value objects as a SignalK delta thru the
     * server and out to all external subscribers.
     * @param {array} values An array of one or more objects with each element
     *   being in the format { path: "signal.k.path", value: "someValue" }
     * @see #sendSK
     */
    sendSKValues(values) {
    
        var delta = {
          "updates": [
            {
              "source": {
                "label": this.id,
              },
              "values": values
            }
          ]
        };
    
        this.debug(`sending SignalK: ${JSON.stringify(delta, null, 2)}`);
        this.app.handleMessage(this.id, delta);
    }
    
    
    /**
     * Outputs a debug message for this plugin. The message will be visible on the
     * console if DEBUG environment variable is set to this plugin's id.
     * @param {string} msg The message to display on the console output
     */
    debug(msg) {
        this.app.debug(msg);
    }


    /**
     * Returns a Json Schema that defines the user configurable options that this plugin utilizes.
     * You can define the value of this schema by calling the various <code>optXXX()</code> methods in
     * this class, or you can define the Json schema manually and assign it to the
     * <code>this._schema</code> variable.  A third alternative is to override this method in your
     * derived class and have it return the Json Schema in any way you see fit.
     */
    schema() {
        return this._schema;
    }
    
    

    /**
     * Defines a string configuration option that the user can set. The specified propName
     * will appear as a property in this._schema, and will have a default value of defaultVal.
     * <p/>This method may be called the normal way by using parameter positions to specify
     * your option definition, or alternatively using a pseudo 'call by name' where
     * the first parameter is an object, and each property name of the object matches
     * the corresponding parameter name.
     * @param {string} propName The name of the property variable used for this option
     * @param {string} title A label that describes this option (short form)
     * @param {string} [defaultVal=''] The default value to use for this option
     * @param {boolean} [isArray=false] TRUE if this option is actually an array of strings
     * @param {string} [longDescription] An optional long description of this option
     * @param {boolean} [required=false] If TRUE, this property must be given a non-blank value
     */
    optStr(propName, title, defaultVal, isArray, longDescription, required) {
        this._defineOption('string', { minLength : 1}, propName, title, (typeof defaultVal !== 'undefined') ? defaultVal: '', isArray, longDescription, required);
    }


    /**
     * Defines a numeric configuration option that the user can set. The specified propName
     * will appear as a property in this._schema, and will have a default value of defaultVal.
     * <p/>This method may be called the normal way by using parameter positions to specify
     * your option definition, or alternatively using a pseudo 'call by name' where
     * the first parameter is an object, and each property name of the object matches
     * the corresponding parameter name.
     * @param {string} propName The name of the property variable used for this option
     * @param {string} title A label that describes this option (short form)
     * @param {number} [defaultVal=0] The default value to use for this option
     * @param {boolean} [isArray=false] TRUE if this option is actually an array of numbers
     * @param {string} [longDescription] An optional long description of this option
     * @param {boolean} [required=false] If TRUE, this property must be given a positive non-zero value
     */
    optNum(propName, title, defaultVal, isArray, longDescription, required) {
        this._defineOption('number', { minimum: 1 }, propName, title, (typeof defaultVal !== 'undefined') ? defaultVal: 0, isArray, longDescription, required);
    }


    /**
     * Defines an interger configuration option that the user can set. The specified propName
     * will appear as a property in this._schema, and will have a default value of defaultVal.
     * <p/>This method may be called the normal way by using parameter positions to specify
     * your option definition, or alternatively using a pseudo 'call by name' where
     * the first parameter is an object, and each property name of the object matches
     * the corresponding parameter name.
     * @param {string} propName The name of the property variable used for this option
     * @param {string} title A label that describes this option (short form)
     * @param {integer} [defaultVal=0] The default value to use for this option
     * @param {boolean} [isArray=false] TRUE if this option is actually an array of integers
     * @param {string} [longDescription] An optional long description of this option
     * @param {boolean} [required=false] If TRUE, this property must be given a positive non-zero value
     */
    optInt(propName, title, defaultVal, isArray, longDescription, required) {
        this._defineOption('integer', { minimum: 1 }, propName, title, (typeof defaultVal !== 'undefined') ? defaultVal: 0, isArray, longDescription, required);
    }


    /**
     * Defines a boolean configuration option that the user can set. The specified propName
     * will appear as a property in this._schema, and will have a default value of defaultVal.
     * <p/>This method may be called the normal way by using parameter positions to specify
     * your option definition, or alternatively using a pseudo 'call by name' where
     * the first parameter is an object, and each property name of the object matches
     * the corresponding parameter name.
     * @param {string} propName The name of the property variable used for this option
     * @param {string} title A label that describes this option (short form)
     * @param {boolean} [defaultVal=false] The default value to use for this option
     * @param {boolean} [isArray=false] TRUE if this option is actually an array of booleans
     * @param {string} [longDescription] An optional long description of this option
     */
    optBool(propName, title, defaultVal, isArray, longDescription) {
        this._defineOption('boolean', {}, propName, title, (typeof defaultVal !== 'undefined') ? defaultVal: false, isArray, longDescription);
    }


    // General purpose worker method to set options. Used by the other
    // optXXX() methods.
    _defineOption(optionType, requiredSpec, propName, title, defaultVal, isArray, longDescription, required) {

        // Support pseudo 'call by name'...
        if (typeof propName === 'object' && typeof title === 'undefined') {
            let oldDV = defaultVal;
            ({ propName, title, defaultVal, isArray, longDescription, required } = propName);
            if (typeof defaultVal === 'undefined') {
                defaultVal = oldDV;
            }
        }

        let opt = {
            title,
            default: defaultVal,
            description: longDescription
        };

        if (isArray) {
           opt.type = 'array';
           opt.items = { type: optionType };
           if (required) {
               Object.assign(opt.items, requiredSpec);
           }
        }
        else {
           opt.type = optionType;
           if (required) {
               Object.assign(opt, requiredSpec);
           }
        }

        let container = this._optContainers[this._optContainers.length-1];
        container[propName] = opt;
    }



    /**
     * Defines configuration option that is itself an object of other properties that the user can set. 
     * The specified propName will appear as a property in this._schema. Once this method is called,
     * all other calls to the optXXX() definition methods will place those properties in this
     * object. This will continue until optObjEnd() is called.  You MUST call optObjEnd() when
     * the object definition has been completed.
     * <p/>This method may be called the normal way by using parameter positions to specify
     * your option definition, or alternatively using a pseudo 'call by name' where
     * the first parameter is an object, and each property name of the object matches
     * the corresponding parameter name.
     * @see optObjEnd
     * @param {string} propName The name of the property variable used for this option
     * @param {string} title A label that describes this option (short form)
     * @param {boolean} [isArray=false] TRUE if this option is actually an array of the defined object
     * @param {string} [longDescription] An optional long description of this option
     * @param {string} [itemTitle] If the isArray param is TRUE, this is the optional title of an
     *                  individual element in the array.
     */
    optObj(propName, title, isArray, longDescription, itemTitle) {

        // Support pseudo 'call by name'...
        if (typeof propName === 'object') {
            ({ propName, title, isArray, longDescription, itemTitle } = propName);
        }


        let container = this._optContainers[this._optContainers.length-1];

        let opt = {
            title,
            description: longDescription
        };

        if (isArray) {
            opt.type = 'array';
            opt.items = { type: 'object', title: itemTitle, properties: {} };
            this._optContainers.push(opt.items.properties);
         }
        else {
           opt.type = 'object';
           opt.properties = {};
           this._optContainers.push(opt.properties);
        }
        container[propName] = opt;
    }



    /**
     * Call this method to end the definition of an object property.
     * @see optObj
     */
    optObjEnd() {
        this._optContainers.pop();
    }



    // Internal method used to ensure each option in the options list has
    // a value that matches the data returned by schema(). If no value exists,
    // it is added, using the default value specified in the schema.
    _setDefaultOptions(options) {
        for (var propName in this.schema().properties) {
            this._checkOption(options, propName);
        } // 
    };

    
    // Check an individual option, creating it with the default value if it
    // does not exist.
    _checkOption(options, propName) {
        if (typeof options[propName] === "undefined") {
            options[propName] = this.schema().properties[propName].default;
        }
    };


    /**
     * Returns TRUE if the specified test value matches the specified matchVal. An
     * empty matchVal is a wildcard that matches any value of testVal. This method
     * is useful for matching optional configuration values to stream filters.
     * @param {string} testVal The current value you are testing
     * @param {string} matchVal The value testVal is to match. If matchVal is empty,
     *   testvVal ALWAYS matches
     * @returns TRUE if testVal == matchVal, or if matchVal is empty/blank
     */
    wildcardEq(testVal, matchVal) {

        function strEmpty(str) {
            return (!str || 0 === str.trim().length);
          }
  
          return (strEmpty(matchVal) || testVal == matchVal);
    }


}

module.exports = SignalKPlugin;