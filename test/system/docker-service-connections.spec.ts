/**
 * Docker Service Connections Validation Tests
 *
 * This test suite validates that all Docker service connections are properly
 * configured and that the application can connect to services using Docker service names.
 *
 * Requirements: 1.1, 2.1, 6.1
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

describe('Docker Service Connections Validation', () => {
  let dockerCompose: any;
  let workflowCompose: any;
  let performanceCompose: any;
  let envDocker: string;
  let envExample: string;

  beforeAll(() => {
    // Load Docker Compose files
    const dockerComposePath = join(process.cwd(), 'docker-compose.yml');
    dockerCompose = yaml.load(readFileSync(dockerComposePath, 'utf8')) as any;

    const workflowComposePath = join(
      process.cwd(),
      'docker-compose.workflow-validation.yml',
    );
    workflowCompose = yaml.load(
      readFileSync(workflowComposePath, 'utf8'),
    ) as any;

    const performanceComposePath = join(
      process.cwd(),
      'docker-compose.performance.yml',
    );
    if (existsSync(performanceComposePath)) {
      performanceCompose = yaml.load(
        readFileSync(performanceComposePath, 'utf8'),
      ) as any;
    }

    // Load environment files
    envDocker = readFileSync(join(process.cwd(), '.env.docker'), 'utf8');
    envExample = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
  });

  describe('Main Docker Compose Service Configuration', () => {
    it('should have all required services defined', () => {
      const requiredServices = [
        'postgres',
        'redis',
        'elasticsearch',
        'kafka',
        'zookeeper',
        'chemchat-app',
      ];

      for (const service of requiredServices) {
        expect(dockerCompose.services).toHaveProperty(service);
      }
    });

    it('should have correct PostgreSQL service configuration', () => {
      const postgres = dockerCompose.services.postgres;

      expect(postgres.image).toBe('postgres:15-alpine');
      expect(postgres.container_name).toBe('chemchat-postgres');
      expect(postgres.environment.POSTGRES_DB).toBe('chatdb');
      expect(postgres.environment.POSTGRES_USER).toBe('chemchat');
      expect(postgres.environment.POSTGRES_PASSWORD).toBe('chemchat_password');
      expect(postgres.ports).toContain('5432:5432');
      expect(postgres.healthcheck).toBeDefined();
    });

    it('should have correct Redis service configuration', () => {
      const redis = dockerCompose.services.redis;

      expect(redis.image).toBe('redis:7-alpine');
      expect(redis.container_name).toBe('chemchat-redis');
      expect(redis.command).toContain('redis-server');
      expect(redis.command).toContain('--requirepass redis_password');
      expect(redis.ports).toContain('6379:6379');
      expect(redis.healthcheck).toBeDefined();
    });

    it('should have correct Elasticsearch service configuration', () => {
      const elasticsearch = dockerCompose.services.elasticsearch;

      expect(elasticsearch.image).toBe(
        'docker.elastic.co/elasticsearch/elasticsearch:8.11.0',
      );
      expect(elasticsearch.container_name).toBe('chemchat-elasticsearch');
      expect(elasticsearch.environment).toContain('discovery.type=single-node');
      expect(elasticsearch.environment).toContain(
        'xpack.security.enabled=false',
      );
      expect(elasticsearch.ports).toContain('9200:9200');
      expect(elasticsearch.healthcheck).toBeDefined();
    });

    it('should have correct Kafka service configuration', () => {
      const kafka = dockerCompose.services.kafka;
      const zookeeper = dockerCompose.services.zookeeper;

      expect(kafka.image).toBe('confluentinc/cp-kafka:7.4.0');
      expect(kafka.container_name).toBe('chemchat-kafka');
      expect(kafka.depends_on).toContain('zookeeper');
      expect(kafka.environment.KAFKA_ZOOKEEPER_CONNECT).toBe('zookeeper:2181');
      expect(kafka.environment.KAFKA_ADVERTISED_LISTENERS).toBe(
        'PLAINTEXT://localhost:9092',
      );

      expect(zookeeper.image).toBe('confluentinc/cp-zookeeper:7.4.0');
      expect(zookeeper.container_name).toBe('chemchat-zookeeper');
    });

    it('should have correct ChemChat app service configuration', () => {
      const app = dockerCompose.services['chemchat-app'];

      expect(app.container_name).toBe('chemchat-app');
      expect(app.depends_on).toBeDefined();
      expect(app.depends_on.postgres.condition).toBe('service_healthy');
      expect(app.depends_on.redis.condition).toBe('service_healthy');
      expect(app.depends_on.elasticsearch.condition).toBe('service_healthy');
      expect(app.depends_on.kafka.condition).toBe('service_healthy');
      expect(app.env_file).toContain('.env.docker');
      expect(app.healthcheck).toBeDefined();
    });

    it('should have proper network configuration', () => {
      expect(dockerCompose.networks).toBeDefined();
      expect(dockerCompose.networks.default.name).toBe('chemchat-network');
    });
  });

  describe('Environment Configuration for Docker Services', () => {
    it('should use Docker service names in .env.docker', () => {
      // Database connection should use 'postgres' service name
      expect(envDocker).toContain(
        'DATABASE_URL="postgresql://chemchat:chemchat_password@postgres:5432/chatdb"',
      );

      // Redis connection should use 'redis' service name
      expect(envDocker).toContain('REDIS_HOST="redis"');
      expect(envDocker).toContain('REDIS_PORT=6379');
      expect(envDocker).toContain('REDIS_PASSWORD="redis_password"');

      // Elasticsearch connection should use 'elasticsearch' service name
      expect(envDocker).toContain(
        'ELASTICSEARCH_URL="http://elasticsearch:9200"',
      );

      // Kafka connection should use 'kafka' service name
      expect(envDocker).toContain('KAFKA_BROKERS="kafka:9092"');
    });

    it('should provide localhost alternatives in .env.example', () => {
      // Should show both Docker and localhost options
      expect(envExample).toContain(
        '# For Docker containers use service names:',
      );
      expect(envExample).toContain('# For host machine use localhost:');
      expect(envExample).toContain(
        'DATABASE_URL="postgresql://username:password@localhost:5432/chatdb"',
      );
      expect(envExample).toContain('REDIS_HOST="localhost"');
      expect(envExample).toContain('KAFKA_BROKERS="localhost:9092"');
      expect(envExample).toContain('ELASTICSEARCH_URL="http://localhost:9200"');
    });

    it('should have consistent service credentials across configurations', () => {
      // PostgreSQL credentials should match between docker-compose and .env.docker
      const postgres = dockerCompose.services.postgres;
      expect(envDocker).toContain(
        `postgresql://${postgres.environment.POSTGRES_USER}:${postgres.environment.POSTGRES_PASSWORD}@postgres:5432/${postgres.environment.POSTGRES_DB}`,
      );

      // Redis password should match
      expect(envDocker).toContain('REDIS_PASSWORD="redis_password"');
      expect(dockerCompose.services.redis.command).toContain(
        '--requirepass redis_password',
      );
    });
  });

  describe('Workflow Validation Docker Compose Configuration', () => {
    it('should have test-specific service configuration', () => {
      const postgres = workflowCompose.services.postgres;
      const redis = workflowCompose.services.redis;
      const elasticsearch = workflowCompose.services.elasticsearch;

      expect(postgres.environment.POSTGRES_USER).toBe('test');
      expect(postgres.environment.POSTGRES_PASSWORD).toBe('test');
      expect(postgres.environment.POSTGRES_DB).toBe('chemchat_test');

      expect(redis.image).toBe('redis:7-alpine');
      expect(elasticsearch.image).toBe('elasticsearch:8.11.0');
    });

    it('should use correct service names in test environment variables', () => {
      const validator = workflowCompose.services['workflow-validator'];

      expect(validator.environment).toContain(
        'DATABASE_URL=postgresql://test:test@postgres:5432/chemchat_test',
      );
      expect(validator.environment).toContain('REDIS_HOST=redis');
      expect(validator.environment).toContain(
        'ELASTICSEARCH_NODE=http://elasticsearch:9200',
      );
    });

    it('should have proper service dependencies for test services', () => {
      const testServices = [
        'workflow-validator',
        'script-validator',
        'ci-validator',
        'complete-validator',
      ];

      for (const serviceName of testServices) {
        const service = workflowCompose.services[serviceName];
        if (service && service.depends_on) {
          expect(service.depends_on.postgres.condition).toBe('service_healthy');
          expect(service.depends_on.redis.condition).toBe('service_healthy');
          expect(service.depends_on.elasticsearch.condition).toBe(
            'service_healthy',
          );
        }
      }
    });

    it('should have proper test network configuration', () => {
      expect(workflowCompose.networks).toBeDefined();
      expect(workflowCompose.networks['chemchat-test-network']).toBeDefined();
      expect(workflowCompose.networks['chemchat-test-network'].driver).toBe(
        'bridge',
      );
    });
  });

  describe('Performance Testing Docker Configuration', () => {
    it('should have performance-specific configuration if exists', () => {
      if (performanceCompose) {
        // Check if k6 service is configured properly
        if (
          performanceCompose.services.k6 ||
          performanceCompose.services['k6-simple']
        ) {
          const k6Service =
            performanceCompose.services.k6 ||
            performanceCompose.services['k6-simple'];
          expect(k6Service.image).toContain('grafana/k6');
        }

        // Check network configuration
        expect(performanceCompose.networks.default.name).toBe(
          'chemchat-network',
        );

        // Check if services use correct network (they use default network)
        const services = Object.values(performanceCompose.services) as any[];
        for (const service of services) {
          if (service.networks) {
            expect(service.networks).toContain('default');
          }
        }
      }
    });
  });

  describe('Service Health Checks and Dependencies', () => {
    it('should have proper health checks for all critical services', () => {
      const criticalServices = ['postgres', 'redis', 'elasticsearch', 'kafka'];

      for (const serviceName of criticalServices) {
        const service = dockerCompose.services[serviceName];
        expect(service.healthcheck).toBeDefined();
        expect(service.healthcheck.test).toBeDefined();
        expect(service.healthcheck.interval).toBeDefined();
        expect(service.healthcheck.timeout).toBeDefined();
        expect(service.healthcheck.retries).toBeDefined();
      }
    });

    it('should have proper dependency chain', () => {
      const app = dockerCompose.services['chemchat-app'];

      // App should depend on all critical services
      expect(app.depends_on.postgres).toBeDefined();
      expect(app.depends_on.redis).toBeDefined();
      expect(app.depends_on.elasticsearch).toBeDefined();
      expect(app.depends_on.kafka).toBeDefined();

      // All dependencies should wait for health checks
      expect(app.depends_on.postgres.condition).toBe('service_healthy');
      expect(app.depends_on.redis.condition).toBe('service_healthy');
      expect(app.depends_on.elasticsearch.condition).toBe('service_healthy');
      expect(app.depends_on.kafka.condition).toBe('service_healthy');
    });

    it('should have Kafka depending on Zookeeper', () => {
      const kafka = dockerCompose.services.kafka;
      expect(kafka.depends_on).toContain('zookeeper');
    });
  });

  describe('Port Mapping and Service Discovery', () => {
    it('should have consistent port mappings', () => {
      expect(dockerCompose.services.postgres.ports).toContain('5432:5432');
      expect(dockerCompose.services.redis.ports).toContain('6379:6379');
      expect(dockerCompose.services.elasticsearch.ports).toContain('9200:9200');
      expect(dockerCompose.services.kafka.ports).toContain('9092:9092');
      expect(dockerCompose.services['chemchat-app'].ports).toContain(
        '3000:3000',
      );
    });

    it('should use internal service names for inter-service communication', () => {
      // Kafka should connect to zookeeper using service name
      expect(
        dockerCompose.services.kafka.environment.KAFKA_ZOOKEEPER_CONNECT,
      ).toBe('zookeeper:2181');

      // App should connect to services using service names (verified in .env.docker)
      expect(envDocker).toContain('@postgres:5432');
      expect(envDocker).toContain('REDIS_HOST="redis"');
      expect(envDocker).toContain('elasticsearch:9200');
      expect(envDocker).toContain('kafka:9092');
    });
  });

  describe('Volume and Data Persistence', () => {
    it('should have proper volume configuration for data persistence', () => {
      expect(dockerCompose.volumes).toBeDefined();
      expect(dockerCompose.volumes.postgres_data).toBeDefined();
      expect(dockerCompose.volumes.redis_data).toBeDefined();
      expect(dockerCompose.volumes.elasticsearch_data).toBeDefined();

      // Services should use these volumes
      expect(dockerCompose.services.postgres.volumes).toContain(
        'postgres_data:/var/lib/postgresql/data',
      );
      expect(dockerCompose.services.redis.volumes).toContain(
        'redis_data:/data',
      );
      expect(dockerCompose.services.elasticsearch.volumes).toContain(
        'elasticsearch_data:/usr/share/elasticsearch/data',
      );
    });

    it('should have proper application volume mounting for development', () => {
      const app = dockerCompose.services['chemchat-app'];
      expect(app.volumes).toContain('.:/app');
      expect(app.volumes).toContain('/app/node_modules');
      expect(app.volumes).toContain('./logs:/app/logs');
    });
  });

  describe('Management and Monitoring Services', () => {
    it('should have management tools properly configured', () => {
      const managementServices = [
        'adminer',
        'redis-commander',
        'kafka-ui',
        'elasticsearch-head',
      ];

      for (const serviceName of managementServices) {
        const service = dockerCompose.services[serviceName];
        expect(service).toBeDefined();
        expect(service.depends_on).toBeDefined();
        expect(service.ports).toBeDefined();
      }
    });

    it('should have monitoring services properly configured', () => {
      const monitoringServices = ['prometheus', 'grafana', 'jaeger'];

      for (const serviceName of monitoringServices) {
        const service = dockerCompose.services[serviceName];
        expect(service).toBeDefined();
        expect(service.ports).toBeDefined();
      }
    });

    it('should have proper service connections for management tools', () => {
      // Redis Commander should connect to redis service
      expect(dockerCompose.services['redis-commander'].environment).toContain(
        'REDIS_HOSTS=local:redis:6379:0:redis_password',
      );

      // Kafka UI should connect to kafka service
      expect(dockerCompose.services['kafka-ui'].environment).toContain(
        'KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS=kafka:9092',
      );
      expect(dockerCompose.services['kafka-ui'].environment).toContain(
        'KAFKA_CLUSTERS_0_ZOOKEEPER=zookeeper:2181',
      );
    });
  });

  describe('Application Configuration Validation', () => {
    it('should validate application uses correct service connections', () => {
      // Check that app.module.ts uses environment variables that match Docker service names
      const appModulePath = join(process.cwd(), 'src/app.module.ts');
      if (existsSync(appModulePath)) {
        const appModuleContent = readFileSync(appModulePath, 'utf8');

        // Redis configuration should use environment variables
        expect(appModuleContent).toContain('process.env.REDIS_HOST');
        expect(appModuleContent).toContain('process.env.REDIS_PORT');
        expect(appModuleContent).toContain('process.env.REDIS_PASSWORD');
      }
    });

    it('should validate database configuration uses environment variables', () => {
      const dbConfigPath = join(
        process.cwd(),
        'src/shared/config/database.config.ts',
      );
      if (existsSync(dbConfigPath)) {
        const dbConfigContent = readFileSync(dbConfigPath, 'utf8');

        // Database configuration should use DATABASE_URL environment variable
        expect(dbConfigContent).toContain('process.env.DATABASE_URL');
      }
    });
  });

  describe('Docker Compose Override and Environment Specific Configurations', () => {
    it('should have proper environment-specific configurations', () => {
      // Development environment should have debug ports and volume mounts
      const app = dockerCompose.services['chemchat-app'];
      expect(app.ports).toContain('9229:9229'); // Debug port
      expect(app.environment).toContain('NODE_ENV=development');
      expect(app.environment).toContain('LOG_LEVEL=debug');
    });

    it('should have proper restart policies', () => {
      const criticalServices = [
        'postgres',
        'redis',
        'elasticsearch',
        'kafka',
        'chemchat-app',
      ];

      for (const serviceName of criticalServices) {
        const service = dockerCompose.services[serviceName];
        expect(service.restart).toBe('unless-stopped');
      }
    });
  });
});
