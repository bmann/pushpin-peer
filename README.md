# pushpin-peer

A cloud peer for [pushpin](https://github.com/inkandswitch/pushpin) to keep data warm while your computer is sleeping.

## Usage

```
yarn start
```

Options:

```
  -p, --port <number>  Set a custom port for incoming connections
```

or, for extra debug information:

```
DEBUG=hypermerge-crawler yarn start
```

The output of either of these commands will be a Pushpin url. You can use this url in Pushpin to access the peer.

### Inspect and Debug

You can also run pushpin-peer and attach a debugger to the process by running:

```
yarn start-inspect
```

Then, open chrome and navigate to `chrome://inspect`. You should see the node process available for inspection.
