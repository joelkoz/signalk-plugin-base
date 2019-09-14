# SignalK-Plugin-Base
Javascript base class for developing plugins for the [SignalK Node Server](https://github.com/SignalK/signalk-server-node)

# Features
Using SignalKPlugin has the following advantages over developing a plugin from scratch:
- Automatically manages unsubscribing from streams when the subscribeVal() method is used
- Automatically initializes configuration options if the default value is specified 
- Sets up commonly used properties, such as this.dataDir, this.options, this.app, etc.
- Simplifies calls to the Node Server's API by hiding complex API calls in local methods. Learning the
  public methods available on this class is usually all one needs to develop a complete plugin

# Yoeman integration

For even faster development, be sure to see the [Yoeman generator](https://github.com/joelkoz/generator-signalk-plugin) that utilizes this class.

