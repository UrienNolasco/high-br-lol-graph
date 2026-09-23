import { createHash } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ReportFamily,
  ReportOptions,
  record,
  isFiniteNumber,
  REPORT_FAMILIES,
  REPORT_SECTIONS,
} from './report.types';
import { ReportFamilyData } from './report-families';
export const reportBase = (matchId: string, puuid: string) =>
  `/api/v1/matches/${encodeURIComponent(matchId)}/report/${encodeURIComponent(puuid)}`;
export function navigationPath(path: string | undefined): string[] {
  const parts = path ? path.split('.') : [];
  if (
    parts.length > 16 ||
    parts.some(
      (p) =>
        ['__proto__', 'prototype', 'constructor'].includes(p) ||
        !/^([A-Za-z_][A-Za-z0-9_]*|0|[1-9]\d*)$/.test(p),
    )
  )
    throw new BadRequestException('Invalid navigation path');
  return parts;
}
export function selectPath(value: unknown, parts: string[]): unknown {
  let current = value;
  for (const part of parts) {
    if (
      current === null ||
      typeof current !== 'object' ||
      !Object.prototype.hasOwnProperty.call(current, part)
    )
      throw new NotFoundException('Report detail not found');
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
export const isMetric = (value: unknown) => {
  const x = record(value);
  return (
    typeof x.metricId === 'string' &&
    typeof x.unit === 'string' &&
    ['observed', 'derived', 'estimated', 'unavailable'].includes(
      String(x.origin),
    ) &&
    Array.isArray(x.evidence) &&
    'value' in x
  );
};
export const metricKey = (family: string, path: string[]) =>
  `${family}:${Buffer.from(JSON.stringify(path)).toString('base64url')}`;
export function parseMetricKey(key: string): {
  family: ReportFamily | 'totals' | 'episodes';
  path: string[];
} {
  const [family, ...rest] = key.split(':');
  if (
    !(
      REPORT_FAMILIES.includes(family as ReportFamily) ||
      family === 'totals' ||
      family === 'episodes'
    ) ||
    rest.length !== 1 ||
    key.length > 1536
  )
    throw new BadRequestException('Invalid metric identifier');
  try {
    const path: unknown = JSON.parse(
      Buffer.from(rest[0], 'base64url').toString('utf8'),
    );
    if (
      !Array.isArray(path) ||
      !path.every((p) => typeof p === 'string') ||
      path.length > 16 ||
      (family === 'totals'
        ? path.length !== 1
        : family === 'episodes'
          ? path.length !== 2 ||
            !['occurrence', 'associatedCaptures'].includes(path[1]) ||
            !/^(death|kill|objective):[A-Za-z0-9_:-]+$/.test(path[0])
          : !REPORT_SECTIONS[family as ReportFamily].includes(path[0]))
    )
      throw new Error();
    if (family !== 'episodes') navigationPath(path.join('.'));
    return { family: family as ReportFamily | 'totals' | 'episodes', path };
  } catch {
    throw new BadRequestException('Invalid metric identifier');
  }
}
export const evidenceId = (family: string, evidence: unknown) =>
  `${family}:${createHash('sha256').update(JSON.stringify(evidence)).digest('hex').slice(0, 24)}`;
export interface MetricRef {
  id: string;
  href: string;
  eventId?: string;
  timestampMs?: number;
}
export function reportMetric(
  raw: unknown,
  family: ReportFamily | 'totals' | 'episodes',
  path: string[],
  meta: {
    metricVersion: number;
    processingVersion: number | null;
    processedAt: string | null;
  },
  base: string,
  evidenceLimit: number,
  mode: ReportOptions['mode'] = 'pastOnly',
) {
  const m = record(raw),
    proof = Array.isArray(m.evidence) ? m.evidence : [];
  const refs = proof.map((e) => {
    const data = record(e),
      id = evidenceId(family, e);
    return {
      id,
      href: `${base}/evidence/${encodeURIComponent(id)}?mode=${mode}`,
      ...(typeof data.eventId === 'string' ? { eventId: data.eventId } : {}),
      ...(isFiniteNumber(data.timestampMs)
        ? { timestampMs: data.timestampMs }
        : {}),
    };
  });
  const metric = Object.fromEntries(
    Object.entries(m).filter(([key]) => key !== 'evidence'),
  );
  const key = metricKey(family, path);
  return {
    metricVersion: meta.metricVersion,
    processingVersion: meta.processingVersion,
    processedAt: meta.processedAt,
    ...metric,
    value: m.value ?? null,
    window: m.window ?? null,
    denominator: m.denominator ?? null,
    key,
    evidence: {
      items: refs.slice(0, evidenceLimit),
      total: refs.length,
      offset: 0,
      limit: evidenceLimit,
      hasMore: refs.length > evidenceLimit,
      next:
        refs.length > evidenceLimit
          ? `${base}/metrics/${encodeURIComponent(key)}?offset=${evidenceLimit}&limit=10&mode=${mode}`
          : null,
    },
    href: `${base}/metrics/${encodeURIComponent(key)}?mode=${mode}`,
  };
}
export function page<T, U>(
  all: T[],
  offset: number,
  limit: number,
  render: (item: T, index: number) => U,
  href: (offset: number) => string,
) {
  return {
    items: all
      .slice(offset, offset + limit)
      .map((item, index) => render(item, offset + index)),
    total: all.length,
    offset,
    limit,
    hasMore: offset + limit < all.length,
    next: offset + limit < all.length ? href(offset + limit) : null,
  };
}
export function withinOutput(value: unknown, options: ReportOptions) {
  const row = record(value),
    event = record(row.event);
  const time = [
    row.timestampMs,
    row.timestamp,
    event.timestampMs,
    row.targetMs,
    row.startMs,
  ].find(isFiniteNumber);
  return (
    time === undefined ||
    ((options.fromMs === undefined || time >= options.fromMs) &&
      (options.toMs === undefined || time < options.toMs))
  );
}
export function compactSection(
  family: ReportFamilyData,
  section: string,
  value: unknown,
  path: string[],
  base: string,
  options: ReportOptions,
  depth = 0,
): unknown {
  const href = (relative: string[], offset = 0) => {
    const params = new URLSearchParams({
      section,
      offset: String(offset),
      limit: String(options.limit),
      evidenceLimit: String(options.evidenceLimit),
      mode: options.mode,
    });
    if (relative.length) params.set('path', relative.join('.'));
    if (options.fromMs !== undefined)
      params.set('fromMs', String(options.fromMs));
    if (options.toMs !== undefined) params.set('toMs', String(options.toMs));
    return `${base}/families/${family.family}?${params}`;
  };
  if (isMetric(value))
    return reportMetric(
      value,
      family.family,
      [section, ...path],
      family,
      base,
      options.evidenceLimit,
      options.mode,
    );
  if (depth >= 8 && value !== null && typeof value === 'object')
    return { kind: 'detail', href: href(path), reason: 'summary_depth_limit' };
  if (Array.isArray(value)) {
    const indexed = (value as unknown[])
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => withinOutput(item, options));
    const offset = depth === 0 ? options.offset : 0,
      limit = depth === 0 ? options.limit : Math.min(3, options.limit);
    return page(
      indexed,
      offset,
      limit,
      ({ item, index }) =>
        compactSection(
          family,
          section,
          item,
          [...path, String(index)],
          base,
          options,
          depth + 1,
        ),
      (next) => href(path, next),
    );
  }
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        compactSection(
          family,
          section,
          child,
          [...path, key],
          base,
          options,
          depth + 1,
        ),
      ]),
    );
  if (typeof value === 'string' && value.length > 2000)
    return {
      kind: 'text',
      value: value.slice(0, 2000),
      totalCharacters: value.length,
      truncated: true,
      reason: 'text_limit',
    };
  return value;
}
export function collectEvidence(
  value: unknown,
  family: string,
  id: string,
): unknown {
  if (isMetric(value)) {
    for (const proof of record(value).evidence as unknown[])
      if (evidenceId(family, proof) === id) return proof;
    return undefined;
  }
  if (value !== null && typeof value === 'object')
    for (const child of Object.values(value)) {
      const found = collectEvidence(child, family, id);
      if (found !== undefined) return found;
    }
  return undefined;
}
