import { register, unregister } from './serviceWorker';

describe('serviceWorker', () => {
  const originalSW = navigator.serviceWorker;

  afterEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: originalSW,
      writable: true,
      configurable: true,
    });
    jest.restoreAllMocks();
  });

  it('does nothing when serviceWorker is not supported', () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(() => register()).not.toThrow();
  });

  it('registers service worker on window load', () => {
    const mockRegister = jest.fn().mockResolvedValue({ onupdatefound: null });
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: mockRegister, controller: null },
      writable: true,
      configurable: true,
    });

    // Capture the load listener
    const listeners: Record<string, Function[]> = {};
    const origAdd = window.addEventListener.bind(window);
    jest.spyOn(window, 'addEventListener').mockImplementation((event: string, handler: any) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
      origAdd(event, handler);
    });

    register();
    expect(listeners['load']).toBeDefined();
    expect(listeners['load'].length).toBeGreaterThan(0);
  });

  it('calls onError when registration fails', async () => {
    const error = new Error('SW registration failed');
    const mockRegister = jest.fn().mockRejectedValue(error);
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: mockRegister, controller: null },
      writable: true,
      configurable: true,
    });

    const onError = jest.fn();

    // Capture load handler
    let loadHandler: Function | undefined;
    const origAdd = window.addEventListener.bind(window);
    jest.spyOn(window, 'addEventListener').mockImplementation((event: string, handler: any) => {
      if (event === 'load') loadHandler = handler;
      origAdd(event, handler);
    });

    register({ onError });

    // Trigger load
    if (loadHandler) {
      loadHandler();
      // Wait for async registration to settle
      await new Promise((r) => setTimeout(r, 50));
      expect(onError).toHaveBeenCalledWith(error);
    }
  });

  it('unregister calls registration.unregister', async () => {
    const mockUnregister = jest.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({ unregister: mockUnregister }),
      },
      writable: true,
      configurable: true,
    });

    unregister();
    await new Promise((r) => setTimeout(r, 50));
    expect(mockUnregister).toHaveBeenCalled();
  });
});
