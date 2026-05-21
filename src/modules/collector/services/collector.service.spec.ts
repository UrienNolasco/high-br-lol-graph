import { CollectorService } from './collector.service';

interface MockConfig {
  isEnabled: jest.Mock;
  setEnabled: jest.Mock;
  getWindow: jest.Mock;
  getLastRun: jest.Mock;
  setLastRun: jest.Mock;
}

interface MockPipeline {
  runCollection: jest.Mock;
}

interface MockLogger {
  setContext: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
}

describe('CollectorService', () => {
  let service: CollectorService;
  let mockConfig: MockConfig;
  let mockPipeline: MockPipeline;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockConfig = {
      isEnabled: jest.fn(),
      setEnabled: jest.fn(),
      getWindow: jest.fn(),
      getLastRun: jest.fn(),
      setLastRun: jest.fn(),
    };
    mockPipeline = {
      runCollection: jest.fn(),
    };
    mockLogger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    service = new CollectorService(mockConfig, mockPipeline, mockLogger);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('setEnabled', () => {
    it('should delegate to config service', async () => {
      await service.setEnabled(true);

      expect(mockConfig.setEnabled).toHaveBeenCalledWith(true);
    });
  });

  describe('getStatus', () => {
    it('should aggregate config and state', async () => {
      mockConfig.isEnabled.mockResolvedValue(true);
      mockConfig.getWindow.mockResolvedValue({ startHour: 1, endHour: 8 });
      mockConfig.getLastRun.mockResolvedValue('2026-01-01T00:00:00Z');

      const result = await service.getStatus();

      expect(result).toEqual({
        enabled: true,
        isRunning: false,
        lastRun: '2026-01-01T00:00:00Z',
        startHour: 1,
        endHour: 8,
      });
    });
  });

  describe('triggerNow', () => {
    it('should run pipeline and set last run', async () => {
      mockConfig.getWindow.mockResolvedValue({ startHour: 1, endHour: 8 });

      await service.triggerNow();

      expect(mockPipeline.runCollection).toHaveBeenCalledWith({
        startHour: 1,
        endHour: 8,
      });
      expect(mockConfig.setLastRun).toHaveBeenCalled();
    });

    it('should skip when already running', async () => {
      mockConfig.getWindow.mockResolvedValue({ startHour: 1, endHour: 8 });
      mockConfig.isEnabled.mockResolvedValue(true);

      let resolvePromise: () => void;
      mockPipeline.runCollection.mockReturnValue(
        new Promise<void>((r) => {
          resolvePromise = r;
        }),
      );

      void service.triggerNow();
      const secondCall = service.triggerNow();

      resolvePromise!();
      await secondCall;

      expect(mockPipeline.runCollection).toHaveBeenCalledTimes(1);
    });
  });

  describe('scheduledCollection', () => {
    it('should skip when disabled', async () => {
      mockConfig.isEnabled.mockResolvedValue(false);

      await service.scheduledCollection();

      expect(mockPipeline.runCollection).not.toHaveBeenCalled();
    });

    it('should skip when already running', async () => {
      mockConfig.isEnabled.mockResolvedValue(true);
      service['isRunning'] = true;

      await service.scheduledCollection();

      expect(mockPipeline.runCollection).not.toHaveBeenCalled();
    });
  });
});
