import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeTimelineEvents } from '../../../../core/riot/normalized-events';
import { projectTimelineSnapshots } from '../../../../core/riot/timeline-snapshots';
import { projectFinalInventory } from '../../../../core/riot/final-inventory';
import { TimelineDto } from '../../../../core/riot/dto/timeline.dto';
import { MatchDto } from '../../../../core/riot/dto/match.dto';
import { unavailableItemCatalog } from '../../../../core/data-dragon/item-catalog';
import { unavailableSkillCatalog } from '../../../../core/data-dragon/skill-catalog';
import { calculateProgression } from './progression-calculator';
import {
  fixture,
  event,
  itemCatalog,
  skillCatalog,
} from './progression.fixture';
import { PROGRESSION_EVENT_TYPES } from './types';
describe('MET16 progression calculations', () => {
  it('preserves all real item/skill payloads and authoritative final slots in the 41-frame fixture', () => {
    const summary = JSON.parse(
      readFileSync(
        join(__dirname, '../../../../../exemplo_partida_BR1_3200579475.json'),
        'utf8',
      ),
    ) as MatchDto;
    const timeline = JSON.parse(
      readFileSync(
        join(
          __dirname,
          '../../../../../exemplo_partida_timeline_BR1_3200579475.json',
        ),
        'utf8',
      ),
    ) as TimelineDto;
    const map = new Map(
      summary.info.participants.map((p) => [p.participantId, p.puuid]),
    );
    const events = normalizeTimelineEvents(
      timeline,
      map,
      new Map(
        summary.info.participants.map((p) => [p.participantId, p.teamId]),
      ),
    )
      .filter((e) => PROGRESSION_EVENT_TYPES.includes(e.type ?? ''))
      .map((e) => ({ ...e, processingVersion: 2 }));
    expect(timeline.info.frames).toHaveLength(41);
    let itemN = 0,
      skillN = 0,
      undoN = 0;
    for (const p of summary.info.participants) {
      const r = calculateProgression(
        fixture(events, {
          matchId: summary.metadata.matchId,
          gameVersion: summary.info.gameVersion,
          participant: { ...p, finalInventory: projectFinalInventory(p) },
          snapshotProjection: projectTimelineSnapshots(timeline, map),
        }),
        unavailableItemCatalog(summary.info.gameVersion),
        unavailableSkillCatalog(summary.info.gameVersion, p.championId),
      );
      expect(r.quality.available).toBe(true);
      expect(r.finalInventory.finalBuild.map((s) => s.itemId)).toEqual(
        Array.from({ length: 7 }, (_, i) => (p as any)[`item${i}`]),
      );
      for (const e of [...r.originalItemEvents, ...r.originalSkillEvents])
        expect(e.payload).toEqual(
          timeline.info.frames[e.frameIndex].events[e.eventIndex],
        );
      itemN += r.originalItemEvents.length;
      skillN += r.originalSkillEvents.length;
      undoN += r.originalItemEvents.filter(
        (e) => e.type === 'ITEM_UNDO',
      ).length;
      expect(
        r.skillSequence!.every(
          (s) => s.validation.reason === 'catalog_unavailable',
        ),
      ).toBe(true);
      expect(
        r.skillSequence!.every(
          (s) =>
            s.levelContext.timestampMs === null ||
            s.levelContext.timestampMs <= s.timestampMs!,
        ),
      ).toBe(true);
    }
    expect(itemN).toBe(604);
    expect(skillN).toBe(177);
    expect(undoN).toBe(18);
    expect(
      events.filter(
        (e) => e.actorPuuid === null && e.type === 'ITEM_PURCHASED',
      ),
    ).toHaveLength(2);
  });
  it('separates final slots from trajectory and first effective observed acquisition after undo', () => {
    const r = calculateProgression(
      fixture([
        event(),
        event(
          'ITEM_UNDO',
          { beforeId: 1001, afterId: 0, goldGain: 300 },
          1,
          2000,
        ),
        event('ITEM_PURCHASED', { itemId: 1001 }, 2, 3000),
        event('ITEM_SOLD', { itemId: 1001 }, 3, 4000),
      ]),
      itemCatalog,
      skillCatalog,
    );
    expect(r.trajectory!.observedInventory).toEqual([
      { itemId: 1001, quantity: 0 },
    ]);
    expect(r.finalInventory.finalBuild[0].itemId).toBe(1001);
    expect(r.trajectory!.itemTimings[0]).toMatchObject({
      effectivePurchaseCount: 1,
      firstEffectiveObservedAt: { value: 3000, unit: 'milliseconds' },
    });
    expect(r.originalItemEvents[1].payload).toMatchObject({
      beforeId: 1001,
      afterId: 0,
      goldGain: 300,
    });
  });
  it('validates normal skill ranks against champion/patch catalog and preserves unknown types/slots', () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      event(
        'SKILL_LEVEL_UP',
        { skillSlot: 1, levelUpType: 'NORMAL' },
        i,
        i * 1000,
      ),
    );
    rows.push(
      event('SKILL_LEVEL_UP', { skillSlot: 4, levelUpType: 'EVOLVE' }, 6, 6000),
      event('SKILL_LEVEL_UP', { skillSlot: 9, levelUpType: 'NORMAL' }, 7, 7000),
    );
    const r = calculateProgression(fixture(rows), itemCatalog, skillCatalog);
    expect(r.skillSequence![0]).toMatchObject({
      observedNormalRank: 1,
      validation: { status: 'catalog_consistent' },
      allocationAt: { value: 0 },
      sincePreviousAllocation: { value: null },
    });
    expect(r.skillSequence![1].sincePreviousAllocation.value).toBe(1000);
    expect(r.skillSequence![5].validation.reason).toBe(
      'rank_exceeds_catalog_max',
    );
    expect(r.skillSequence![6].validation.reason).toBe(
      'unsupported_level_up_type',
    );
    expect(r.skillSequence![6].observedNormalRank).toBeNull();
    expect(r.skillSequence![7].validation.reason).toBe('unknown_skill_slot');
  });
  it('rejects wrong patch/champion metadata and never substitutes current catalogs', () => {
    const r = calculateProgression(
      fixture([
        event('SKILL_LEVEL_UP', { skillSlot: 1, levelUpType: 'NORMAL' }),
      ]),
      { ...itemCatalog, version: '16.20.1' },
      { ...skillCatalog, championId: 2 },
    );
    expect(r.catalogs.items.reason).toBe('unsupported_version');
    expect(r.skillSequence![0].metadata).toBeNull();
    expect(r.skillSequence![0].validation.reason).toBe('unsupported_version');
  });
  it('deduplicates identical identities while preserving distinct same-timestamp events', () => {
    const a = event();
    const r = calculateProgression(
      fixture([a, { ...a }, event('ITEM_PURCHASED', { itemId: 1001 }, 1)]),
      itemCatalog,
      skillCatalog,
    );
    expect(r.originalItemEvents).toHaveLength(2);
    expect(r.quality.duplicateIdentities).toBe(1);
    expect(r.trajectory!.observedInventory[0].quantity).toBe(2);
    expect(
      calculateProgression(
        fixture([a, { ...a, payload: { itemId: 99 } }]),
        itemCatalog,
        skillCatalog,
      ).trajectory,
    ).toBeNull();
  });
  it('requires real provenance, compatible projection generation and observed end; final inventory remains available', () => {
    for (const processing of [
      null,
      { status: 'COMPLETED', processingVersion: 2, completedAt: null },
    ]) {
      const r = calculateProgression(
        fixture([], { processing }),
        itemCatalog,
        skillCatalog,
      );
      expect(r.processedAt).toBeNull();
      expect(r.trajectory).toBeNull();
      expect(r.finalInventory.finalBuild[0].itemId).toBe(1001);
    }
    const noEnd = fixture();
    noEnd.events = noEnd.events.filter((e) => e.type !== 'GAME_END');
    expect(
      calculateProgression(noEnd, itemCatalog, skillCatalog).quality.reason,
    ).toBe('missing_game_end');
    const newer = fixture();
    newer.processing!.processingVersion = 3;
    newer.events.forEach((e) => (e.processingVersion = 3));
    expect(
      calculateProgression(newer, itemCatalog, skillCatalog).quality.available,
    ).toBe(true);
  });
  it('retains unknown and missing timestamp events without placing them at an invented time', () => {
    const missing = event(
      'SKILL_LEVEL_UP',
      { skillSlot: 1, levelUpType: 'NORMAL' },
      0,
      null,
    );
    const future = {
      ...event('FUTURE_EVENT', {}, 1),
      actorPuuid: null,
      quality: { unknownType: true },
    };
    const r = calculateProgression(
      fixture([missing, future]),
      itemCatalog,
      skillCatalog,
    );
    expect(r.quality.unknownEvents).toBe(1);
    expect(r.skillSequence![0].allocationAt.value).toBeNull();
    expect(r.trajectory!.stateComplete).toBe(false);
  });
  it('rejects different GAME_END identities and cannot validate rank order past an untimed allocation', () => {
    const duplicate = fixture();
    duplicate.events.push({
      ...duplicate.events[duplicate.events.length - 1],
      eventIndex: 10000,
    });
    expect(
      calculateProgression(duplicate, itemCatalog, skillCatalog),
    ).toMatchObject({
      trajectory: null,
      quality: { reason: 'ambiguous_game_end' },
    });
    const untimed = fixture([
      event('SKILL_LEVEL_UP', { skillSlot: 1, levelUpType: 'NORMAL' }, 0, null),
      event('SKILL_LEVEL_UP', { skillSlot: 1, levelUpType: 'NORMAL' }, 1, 1000),
    ]);
    const r = calculateProgression(untimed, itemCatalog, skillCatalog);
    expect(r.skillSequence![0]).toMatchObject({
      observedNormalRank: null,
      validation: { reason: 'incomplete_allocation_order' },
    });
  });
  it('flags final-slot differences without changing either observed trajectory or authoritative slots', () => {
    const r = calculateProgression(
      fixture([event(), event('ITEM_SOLD', { itemId: 1001 }, 1, 2000)]),
      itemCatalog,
      skillCatalog,
    );
    expect(r.trajectory).toMatchObject({
      stateComplete: false,
      finalInventoryReconciliation: [
        {
          itemId: 1001,
          observedQuantity: 0,
          finalSlotQuantity: 1,
          matches: false,
        },
      ],
    });
  });
});
