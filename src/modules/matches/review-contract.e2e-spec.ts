import { PrismaService } from '../../core/prisma/prisma.service';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';
import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type {
  ReferenceObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import request from 'supertest';
import { MatchesModule } from './matches.module';
import { MATCH_REVIEW_READER } from './ports/match-review-reader';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { matchReviewFixture } from '../../../test/fixtures/match-review.fixture';

/** Contract audit: every returned public field must have a concrete documented shape. */
function assertDocumentedResponse(
  value: unknown,
  rawSchema: SchemaObject | ReferenceObject,
  schemas: Record<string, SchemaObject | ReferenceObject>,
  path = '$',
): void {
  function resolve(schema: SchemaObject | ReferenceObject): SchemaObject {
    if ('$ref' in schema) {
      const { $ref, ...siblings } = schema;
      const name = $ref.split('/').at(-1);
      if (!name || !schemas[name])
        throw new Error(`Missing schema ${name} at ${path}`);
      return { ...resolve(schemas[name]), ...siblings };
    }
    if (schema.allOf) {
      const { allOf, ...siblings } = schema;
      return allOf.map(resolve).reduce<SchemaObject>(
        (out, part) => ({
          ...out,
          ...part,
          properties: { ...out.properties, ...part.properties },
          required: [...(out.required ?? []), ...(part.required ?? [])],
        }),
        siblings,
      );
    }
    return schema;
  }
  let schema = resolve(rawSchema);
  if (value === null) {
    if (schema.nullable !== true)
      throw new Error(`Undocumented null at ${path}`);
    return;
  }
  if (schema.oneOf) {
    const variants = schema.oneOf.map(resolve);
    const selected = variants.find((candidate) => {
      if (typeof value === 'object' && !Array.isArray(value))
        return (
          candidate.type === 'object' &&
          (candidate.required ?? []).every((key: string) =>
            Object.hasOwn(value, key),
          )
        );
      return candidate.type === typeof value;
    });
    if (!selected) throw new Error(`No documented variant at ${path}`);
    schema = selected;
  }
  if (Array.isArray(value)) {
    const items = schema.items;
    if (!items) throw new Error(`Undocumented array items at ${path}`);
    const values: unknown[] = value;
    values.forEach((child, i) =>
      assertDocumentedResponse(child, items, schemas, `${path}[${i}]`),
    );
  } else if (typeof value === 'object') {
    for (const key of schema.required ?? [])
      if (!Object.hasOwn(value, key))
        throw new Error(`Missing required field ${path}.${key}`);
    for (const [key, child] of Object.entries(value)) {
      if (!schema.properties?.[key])
        throw new Error(`Undocumented public field ${path}.${key}`);
      assertDocumentedResponse(
        child,
        schema.properties[key],
        schemas,
        `${path}.${key}`,
      );
    }
  } else if (schema.enum) {
    expect(schema.enum).toContain(value);
  } else if (schema.type) {
    expect(typeof value).toBe(
      schema.type === 'integer' ? 'number' : schema.type,
    );
  }
}

describe('observed match review HTTP/OpenAPI', () => {
  let app: INestApplication;
  const reader = { findReview: jest.fn() };
  const path = '/api/v1/matches/REVIEW_TEST/review/review-p1';
  beforeAll(async () => {
    app = await createTestingApp(MatchesModule, {
      overrides: [
        { provide: MATCH_REVIEW_READER, useValue: reader },
        { provide: PrismaService, useValue: mockPrismaService() },
      ],
    });
  });
  beforeEach(() => reader.findReview.mockResolvedValue(matchReviewFixture()));
  afterAll(async () => app.close());
  it('exposes damage peaks and resource coverage from persisted provenance', async () => {
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    expect(body).toMatchObject({
      metricVersion: 1,
      processedAt: '2026-10-01T00:00:00.000Z',
      reason: null,
      temporalScope: 'retrospective_match_review',
      summary: {
        deathEpisodes: 2,
        eligibleDeathEpisodes: 1,
        damageComplete: true,
      },
    });
    expect(body.highlights.personalPeak.personalDamage.value).toBe(100);
    expect(body.links.deaths).toBe(path + '/deaths');
  });
  it('paginates death cards and follows the encoded stable event identity', async () => {
    const { body } = await request(app.getHttpServer())
      .get(path + '/deaths?limit=1')
      .expect(200);
    expect(body).toMatchObject({
      total: 2,
      offset: 0,
      limit: 1,
      hasMore: true,
    });
    expect(body.items[0]).toMatchObject({
      eligible: true,
      eventId: 'REVIEW_TEST:4:0',
      deathMs: 195000,
    });
    const detail = await request(app.getHttpServer())
      .get(body.items[0].href)
      .expect(200);
    expect(detail.body.recap.listedDamage.total).toBe(420);
    expect(detail.body.resources.before.actualMs).toBe(180000);
    const next = await request(app.getHttpServer()).get(body.next).expect(200);
    expect(next.body.items[0].eligible).toBe(false);
    await request(app.getHttpServer())
      .get(path + '/deaths/REVIEW_TEST%3A0%3A99')
      .expect(404);
  });
  it('filters the presentation without changing full-match damage shares or ranks', async () => {
    const { body } = await request(app.getHttpServer())
      .get(
        path +
          '/damage?fromMs=120000&toMs=300000&deaths=none&sort=damage&limit=1',
      )
      .expect(200);
    expect(body.total).toBe(2);
    expect(body.items[0].startMs).toBe(120000);
    expect(body.items[0].personalRank).toBe(3);
    expect(body.items[0].shareOfFinalDamage.value).toBeCloseTo(100 / 1100);
    const next = await request(app.getHttpServer()).get(body.next).expect(200);
    expect(next.body.items[0].startMs).toBe(240000);
    expect(next.body.filters).toMatchObject({
      fromMs: 120000,
      toMs: 300000,
      deaths: 'none',
      sort: 'damage',
    });
  });
  it('distinguishes missing metadata and unavailable combat from zero', async () => {
    const i = matchReviewFixture();
    i.processing = null;
    reader.findReview.mockResolvedValue(i);
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    expect(body).toMatchObject({
      processedAt: null,
      reason: 'missing_processing_provenance',
      highlights: { personalPeak: null },
    });
    const j = matchReviewFixture();
    j.events.pop();
    reader.findReview.mockResolvedValue(j);
    const intervals = await request(app.getHttpServer())
      .get(path + '/damage?deaths=none')
      .expect(200);
    expect(intervals.body.items).toEqual([]);
    expect(intervals.body.complete).toBe(false);
  });
  it.each([
    'limit=0',
    'limit=51',
    'offset=-1',
    'fromMs=100&toMs=100',
    'sort=gold',
    'deaths=false',
    'limit=1.5',
  ])('rejects invalid query %s', async (q) => {
    await request(app.getHttpServer())
      .get(path + '/damage?' + q)
      .expect(400);
  });
  it('returns404 for missing match or participant', async () => {
    reader.findReview.mockResolvedValue(null);
    await request(app.getHttpServer()).get(path).expect(404);
  });
  it('documents nullable observations, bounded pagination and retrospective scope', () => {
    const d = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Review').setVersion('1').build(),
    );
    expect(
      d.paths['/api/v1/matches/{matchId}/review/{puuid}/deaths/{eventId}'],
    ).toBeDefined();
    expect(d.components!.schemas!.ReviewValueDto).toMatchObject({
      properties: { value: { nullable: true }, reason: { nullable: true } },
    });
    expect(d.components!.schemas!.MatchReviewQueryDto).toBeUndefined();
    const parameters =
      d.paths['/api/v1/matches/{matchId}/review/{puuid}/damage'].get!
        .parameters!;
    expect(parameters).toContainEqual(
      expect.objectContaining({
        name: 'limit',
        schema: expect.objectContaining({ maximum: 50 }),
      }),
    );
  });
  it.each([
    ['', 'MatchReviewOverviewDto'],
    ['/deaths?limit=1', 'MatchReviewPageDto'],
    ['/damage?limit=1', 'MatchReviewPageDto'],
    ['/deaths/REVIEW_TEST%3A4%3A0', 'MatchReviewDeathDto'],
  ])(
    'documents every public response field for %s, including nested evidence and coverage',
    async (suffix, model) => {
      const d = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('Review').setVersion('1').build(),
      );
      const schemas = d.components!.schemas!;
      const { body } = await request(app.getHttpServer())
        .get(path + suffix)
        .expect(200);
      assertDocumentedResponse(body, schemas[model], schemas);
      expect(body.metricVersion).toBe(1);
      expect(body.coverage.readLimits).toEqual({
        eventsTruncated: false,
        framesTruncated: false,
      });
    },
  );

  it('documents damage-only page fields without requiring them on the death page', () => {
    const d = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Review').setVersion('1').build(),
    );
    const schema = d.components!.schemas!.MatchReviewPageDto;
    if ('$ref' in schema) throw new Error('Expected the concrete page schema');
    expect(schema.properties).toMatchObject({
      complete: { type: 'boolean' },
      rankingReason: { type: 'string', nullable: true },
    });
    expect(schema.required).toEqual(
      expect.arrayContaining(['metricVersion', 'coverage']),
    );
    expect(schema.required).not.toContain('complete');
    expect(schema.required).not.toContain('rankingReason');
  });

  it('documents unknown values in unavailable overview and damage responses', async () => {
    const i = matchReviewFixture();
    i.processing = null;
    reader.findReview.mockResolvedValue(i);
    const d = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Review').setVersion('1').build(),
    );
    const schemas = d.components!.schemas!;
    for (const [suffix, model] of [
      ['', 'MatchReviewOverviewDto'],
      ['/damage', 'MatchReviewPageDto'],
    ]) {
      const { body } = await request(app.getHttpServer())
        .get(path + suffix)
        .expect(200);
      assertDocumentedResponse(body, schemas[model], schemas);
    }
  });

  it('does not advertise an absent received-damage recap as available', async () => {
    const i = matchReviewFixture();
    delete (i.events[0].payload as Record<string, unknown>)
      .victimDamageReceived;
    reader.findReview.mockResolvedValue(i);
    const { body } = await request(app.getHttpServer())
      .get(path + '/deaths')
      .expect(200);
    expect(body.items[0].recapAvailable).toBe(false);
    expect(body.opponent).toMatchObject({
      puuid: 'review-p6',
      championName: 'Champion6',
    });
  });
  it('hides event shells from rejected processing generations', async () => {
    const i = matchReviewFixture();
    i.processing!.status = 'FAILED';
    reader.findReview.mockResolvedValue(i);
    const { body } = await request(app.getHttpServer())
      .get(path + '/deaths')
      .expect(200);
    expect(body.items).toEqual([]);
    await request(app.getHttpServer())
      .get(path + '/deaths/REVIEW_TEST%3A4%3A0')
      .expect(404);
  });
});
