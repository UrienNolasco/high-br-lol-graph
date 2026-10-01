import { Injectable } from '@nestjs/common';
import { DataDragonService } from '../../../../core/data-dragon/data-dragon.service';
import type { DataDragonChoiceSource } from '../../../../core/data-dragon/catalog-source';
import { compatibleItemVersion } from '../../../../core/data-dragon/catalog-version';
import {
  ChoiceCatalog,
  unavailableChoiceCatalog,
} from '../../contracts/choice-catalog';
import type { ChoiceCatalogReader } from '../../ports/choice-catalog-reader';
import { mapItemCatalog } from './catalog.adapter';
const object = (v: unknown): Record<string, any> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, any>)
    : {};
const id = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) > 0;
export function mapChoiceCatalog(
  source: DataDragonChoiceSource,
): ChoiceCatalog {
  if (source.status !== 'ok')
    return unavailableChoiceCatalog(source.gameVersion, source.status);
  const fail = () =>
    unavailableChoiceCatalog(source.gameVersion, 'invalid_catalog');
  if (
    !source.version ||
    compatibleItemVersion(source.gameVersion, [source.version]) !==
      source.version
  )
    return fail();
  const file = object(source.summoners);
  if (
    file.version !== source.version ||
    !Array.isArray(source.runes) ||
    !source.runes.length
  )
    return fail();
  const catalog: ChoiceCatalog = {
    gameVersion: source.gameVersion,
    version: source.version,
    reason: null,
    policy: 'latest_revision_of_exact_patch',
    runes: {},
    styles: {},
    summoners: {},
  };
  for (const entry of source.runes) {
    const style = object(entry);
    if (
      !id(style.id) ||
      typeof style.name !== 'string' ||
      !Array.isArray(style.slots) ||
      style.slots.length !== 4 ||
      catalog.styles[style.id]
    )
      return fail();
    const slots: number[][] = [];
    for (const slot of style.slots) {
      const slotValue = object(slot);
      if (!Array.isArray(slotValue.runes) || !slotValue.runes.length)
        return fail();
      const ids: number[] = [];
      for (const rawRune of slotValue.runes) {
        const rune = object(rawRune);
        if (
          !id(rune.id) ||
          typeof rune.name !== 'string' ||
          catalog.runes[rune.id]
        )
          return fail();
        ids.push(rune.id);
        catalog.runes[rune.id] = { id: rune.id, name: rune.name };
      }
      slots.push(ids);
    }
    catalog.styles[style.id] = { id: style.id, name: style.name, slots };
  }
  for (const raw of Object.values(object(file.data))) {
    const spell = object(raw);
    if (
      typeof spell.key !== 'string' ||
      !/^[1-9]\d*$/.test(spell.key) ||
      !id(Number(spell.key)) ||
      typeof spell.name !== 'string' ||
      catalog.summoners[spell.key]
    )
      return fail();
    catalog.summoners[spell.key] = { id: Number(spell.key), name: spell.name };
  }
  return Object.keys(catalog.summoners).length ? catalog : fail();
}
@Injectable()
export class ChoiceCatalogAdapter implements ChoiceCatalogReader {
  constructor(private readonly dataDragon: DataDragonService) {}
  async getChoiceCatalog(gameVersion: string) {
    return mapChoiceCatalog(
      await this.dataDragon.getChoiceCatalogSource(gameVersion),
    );
  }
  async getItemCatalog(gameVersion: string) {
    return mapItemCatalog(
      await this.dataDragon.getItemCatalogSourceForGameVersion(gameVersion),
    );
  }
}
