const TickStream = require('../../src/tick-stream');

function makeConfig(overrides = {}) {
  return {
    symbol: '1HZ100V',
    bufferSize: 200,
    minTicksBeforeTrade: 10,
    storeTicks: false,
    dbPath: ':memory:',
    ...overrides,
  };
}

function makeConnectionManager(overrides = {}) {
  const mockSubscribe = jest.fn();
  return {
    isAuthorized: jest.fn().mockReturnValue(true),
    api: {
      subscribe: mockSubscribe,
    },
    ...overrides,
  };
}

function makeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function makeTickData(epoch, quote) {
  return { tick: { epoch, quote } };
}

describe('TickStream', () => {
  let ts;
  let config;
  let cm;
  let logger;

  beforeEach(() => {
    config = makeConfig();
    cm = makeConnectionManager();
    logger = makeLogger();
    ts = new TickStream(config, cm, logger);
  });

  describe('constructor', () => {
    it('initializes with empty buffer', () => {
      expect(ts.buffer).toEqual([]);
      expect(ts.tickCount).toBe(0);
      expect(ts._bufferReadyFired).toBe(false);
    });

    it('does not create storage when storeTicks is false', () => {
      expect(ts._storage).toBeNull();
    });

    it('creates storage when storeTicks is true', () => {
      const withStore = new TickStream(makeConfig({ storeTicks: true }), cm, logger);
      expect(withStore._storage).not.toBeNull();
    });
  });

  describe('start', () => {
    it('throws when not authorized', async () => {
      cm = makeConnectionManager({ isAuthorized: jest.fn().mockReturnValue(false) });
      ts = new TickStream(config, cm, logger);
      await expect(ts.start()).rejects.toThrow('not authorized');
    });

    it('subscribes to ticks when authorized', async () => {
      const subscription = { subscribe: jest.fn() };
      cm.api.subscribe.mockReturnValue(subscription);
      subscription.subscribe.mockReturnValue(undefined);
      await ts.start();
      expect(cm.api.subscribe).toHaveBeenCalledWith({ ticks: '1HZ100V' });
      expect(subscription.subscribe).toHaveBeenCalled();
    });
  });

  describe('_onTick', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('stores tick in buffer', () => {
      ts._onTick(makeTickData(1000, 100.5));
      expect(ts.buffer).toHaveLength(1);
      expect(ts.buffer[0].epoch).toBe(1000);
      expect(ts.buffer[0].quote).toBe(100.5);
    });

    it('handles tick in raw format (no .tick wrapper)', () => {
      ts._onTick({ epoch: 1000, quote: 100.5 });
      expect(ts.buffer).toHaveLength(1);
    });

    it('ignores tick without epoch', () => {
      ts._onTick({ quote: 100.5 });
      expect(ts.buffer).toHaveLength(0);
    });

    it('ignores tick without quote', () => {
      ts._onTick({ epoch: 1000 });
      expect(ts.buffer).toHaveLength(0);
    });

    it('increments tickCount', () => {
      ts._onTick(makeTickData(1000, 100));
      expect(ts.tickCount).toBe(1);
      ts._onTick(makeTickData(1001, 101));
      expect(ts.tickCount).toBe(2);
    });

    it('emits tick event', () => {
      const handler = jest.fn();
      ts.on('tick', handler);
      ts._onTick(makeTickData(1000, 100.5));
      expect(handler).toHaveBeenCalledWith({ epoch: 1000, quote: 100.5 });
    });

    it('fires bufferReady when min ticks reached', () => {
      const handler = jest.fn();
      ts.on('bufferReady', handler);
      for (let i = 0; i < 10; i++) {
        ts._onTick(makeTickData(1000 + i, 100 + i * 0.1));
      }
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('fires bufferReady only once', () => {
      const handler = jest.fn();
      ts.on('bufferReady', handler);
      for (let i = 0; i < 20; i++) {
        ts._onTick(makeTickData(1000 + i, 100 + i * 0.1));
      }
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('respects bufferSize limit', () => {
      ts = new TickStream(makeConfig({ bufferSize: 3 }), cm, logger);
      ts._onTick(makeTickData(1000, 100));
      ts._onTick(makeTickData(1001, 101));
      ts._onTick(makeTickData(1002, 102));
      ts._onTick(makeTickData(1003, 103));
      expect(ts.buffer).toHaveLength(3);
      expect(ts.buffer[0].epoch).toBe(1001);
    });

    it('detects tick gaps > 5s', () => {
      ts._onTick(makeTickData(1000, 100));
      ts._onTick(makeTickData(1007, 101));
      expect(logger.warn).toHaveBeenCalledWith(
        'TickStream',
        expect.stringContaining('Tick gap detected: 7s')
      );
    });

    it('does not warn on normal intervals', () => {
      ts._onTick(makeTickData(1000, 100));
      ts._onTick(makeTickData(1002, 101));
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('stores ticks when storage is enabled', () => {
      const withStore = new TickStream(makeConfig({ storeTicks: true }), cm, logger);
      withStore._storage = { insertTicks: jest.fn() };
      withStore._onTick(makeTickData(1000, 100));
      expect(withStore._storage.insertTicks).toHaveBeenCalledWith('1HZ100V', [1000], [100]);
    });

    it('logs error when storage fails', () => {
      const withStore = new TickStream(makeConfig({ storeTicks: true }), cm, logger);
      withStore._storage = { insertTicks: jest.fn(() => { throw new Error('DB full'); }) };
      withStore._onTick(makeTickData(1000, 100));
      expect(logger.error).toHaveBeenCalledWith('TickStream', expect.stringContaining('Failed to store tick'));
    });

    it('does not log gap warning for first tick', () => {
      ts._onTick(makeTickData(1000, 100));
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('unsubscribes and clears storage', () => {
      const subscription = { unsubscribe: jest.fn() };
      ts._subscription = subscription;
      const withStore = new TickStream(makeConfig({ storeTicks: true }), cm, logger);
      withStore.stop();
      expect(withStore._subscription).toBeNull();
      expect(withStore._storage).toBeNull();
    });

    it('handles stop without subscription', () => {
      expect(() => ts.stop()).not.toThrow();
    });
  });

  describe('getBuffer', () => {
    it('returns the buffer array', () => {
      ts._onTick(makeTickData(1000, 100));
      const buf = ts.getBuffer();
      expect(buf).toBe(ts.buffer);
    });
  });

  describe('getPriceCount', () => {
    it('returns buffer length', () => {
      expect(ts.getPriceCount()).toBe(0);
      ts._onTick(makeTickData(1000, 100));
      expect(ts.getPriceCount()).toBe(1);
    });
  });

  describe('isReady', () => {
    it('returns false when below minTicksBeforeTrade', () => {
      expect(ts.isReady()).toBe(false);
    });

    it('returns true when at minTicksBeforeTrade', () => {
      for (let i = 0; i < 10; i++) {
        ts._onTick(makeTickData(1000 + i, 100 + i));
      }
      expect(ts.isReady()).toBe(true);
    });
  });

  describe('getLastPrice', () => {
    it('returns null when buffer is empty', () => {
      expect(ts.getLastPrice()).toBeNull();
    });

    it('returns last tick quote', () => {
      ts._onTick(makeTickData(1000, 100.5));
      expect(ts.getLastPrice()).toBe(100.5);
    });
  });

  describe('getStoredTicks', () => {
    it('returns empty array when storage is null', () => {
      expect(ts.getStoredTicks('1HZ100V')).toEqual([]);
    });
  });
});
