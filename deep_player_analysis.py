import json
from collections import Counter, defaultdict
from typing import Dict, List, Any

# Carregar o arquivo
with open('exemplo_partida_timeline_BR1_3200579475.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

frames = data['info']['frames']
match_id = data['metadata'].get('matchId', 'unknown')
game_duration_ms = frames[-1].get('timestamp', 0)
game_duration_min = game_duration_ms / 1000 / 60

print("=" * 80)
print(f" ANÁLISE PROFUNDA DE JOGADORES - Partida {match_id}")
print(f" Duração: {game_duration_min:.2f} minutos")
print("=" * 80)

# ============================================================================
# ESTRUTURA PARA ARMAZENAR TODAS AS ESTATÍSTICAS
# ============================================================================
player_stats = {}

for p_id in range(1, 11):
    player_stats[p_id] = {
        # Identificação
        'participant_id': p_id,
        'team': 100 if p_id <= 5 else 200,
        'team_side': 'Blue' if p_id <= 5 else 'Red',

        # Gold
        'gold_timeline': [],  # Gold ao longo do tempo
        'gold_per_min': [],
        'total_gold_earned': 0,
        'gold_from_kills': 0,
        'gold_from_assists': 0,
        'gold_from_minions': 0,
        'gold_from_jungle': 0,
        'gold_spent': 0,

        # CS (Creep Score)
        'cs_timeline': [],
        'minions_killed': 0,
        'jungle_killed': 0,
        'cs_per_min': 0,
        'cs_first_10min': 0,
        'cs_10_20min': 0,
        'cs_20_plus': 0,
        'max_cs_lead': 0,
        'cs_diff_vs_laner': 0,

        # Nível e XP
        'level_timeline': [],
        'xp_timeline': [],
        'max_level': 0,
        'level_ups': [],

        # Habilidades
        'skill_ups': defaultdict(int),
        'skill_order': [],

        # Wards
        'wards_placed': 0,
        'wards_placed_timeline': [],
        'wards_killed': 0,
        'wards_killed_timeline': [],
        'wards_by_type': Counter(),
        'pink_wards_placed': 0,
        'pink_wards_killed': 0,
        'ward_survival_time': [],  # Tempo que cada ward sobreviveu
        'vision_score_built': 0,

        # Combate
        'kills': 0,
        'deaths': 0,
        'assists': 0,
        'kill_timeline': [],  # Timestamp de cada kill
        'death_timeline': [],
        'assist_timeline': [],
        'kills_first_10min': 0,
        'deaths_first_10min': 0,
        'first_blood': False,
        'first_blood_participant': False,  # Se deu ou tomou FB
        'multi_kills': Counter(),  # double, triple, quadra, penta
        'kill_streaks': [],
        'bounty_gold': 0,
        'shutdown_gold_earned': 0,

        # Dano
        'damage_dealt_total': 0,
        'damage_dealt_to_champs': 0,
        'damage_dealt_to_champs_timeline': [],
        'physical_damage': 0,
        'magic_damage': 0,
        'true_damage': 0,
        'damage_taken': 0,
        'damage_taken_timeline': [],
        'physical_damage_taken': 0,
        'magic_damage_taken': 0,
        'true_damage_taken': 0,
        'damage_per_minute': [],

        # Stats de campeão (timeline)
        'health_timeline': [],
        'mana_or_power_timeline': [],
        'attack_damage_timeline': [],
        'ability_power_timeline': [],
        'attack_speed_timeline': [],
        'armor_timeline': [],
        'magic_resist_timeline': [],
        'movement_speed_timeline': [],
        'crit_chance_timeline': [],
        'lifesteal_timeline': [],
        'spell_vamp_timeline': [],

        # Itens
        'items_purchased': [],
        'items_purchased_timeline': [],
        'items_sold': [],
        'items_sold_timeline': [],
        'items_destroyed': [],  # Consumíveis usados
        'item_undo': [],
        'total_items_bought': 0,
        'final_build': [],
        'full_build_time': None,  # Quando completou 6 itens

        # Objetivos
        'turrets_plates_destroyed': 0,
        'turrets damaged': [],  # Torres que causou dano
        'turrets_killed_participation': 0,
        'dragon_kills_participation': 0,
        'baron_kills_participation': 0,
        'herald_kills_participation': 0,
        'objective_damage': 0,

        # Posição
        'positions': [],  # (x, y, timestamp)

        # Tempo de controle
        'time_cc_dealt': 0,
        'time_cc_received': 0,
        'time_enemy_spent_controlled': 0,

        # Farm por área
        'own_jungle_cs': 0,
        'enemy_jungle_cs': 0,
        'lane_cs': 0,

        # Eficiência
        'gold_efficiency': 0,  # Dano por gold
        'kill_participation': 0,
        'death_pattern': [],  # Padrão de mortes (ganks, solo, etc)
    }

# ============================================================================
# FUNÇÕES AUXILIARES
# ============================================================================
def get_phase(timestamp_ms):
    """Retorna a fase do jogo baseado no timestamp"""
    minutes = timestamp_ms / 1000 / 60
    if minutes < 10:
        return 'early'
    elif minutes < 25:
        return 'mid'
    else:
        return 'late'

def is_own_jungle(x, y, team):
    """Verifica se está na própria selva"""
    if team == 100:  # Blue team
        return x < 6500 and y < 6500
    else:  # Red team
        return x > 10000 and y > 10000

# ============================================================================
# PROCESSAR TODOS OS FRAMES E EVENTOS
# ============================================================================

# Flags para rastrear eventos especiais
first_blood_killer = None
first_blood_victim = None

# Processar cada frame
for frame_idx, frame in enumerate(frames):
    frame_ts = frame.get('timestamp', 0)
    frame_min = frame_ts / 1000 / 60

    # Processar participantFrames (estado de cada jogador)
    participant_frames = frame.get('participantFrames', {})

    for p_id_str, p_data in participant_frames.items():
        p_id = int(p_id_str)
        stats = player_stats[p_id]

        # Gold
        current_gold = p_data.get('currentGold', 0)
        total_gold = p_data.get('totalGold', 0)
        gold_per_sec = p_data.get('goldPerSecond', 0)
        stats['gold_timeline'].append((frame_ts, current_gold, total_gold))
        stats['gold_per_min'].append(gold_per_sec * 60)

        # CS
        minions = p_data.get('minionsKilled', 0)
        jungle = p_data.get('jungleMinionsKilled', 0)
        stats['cs_timeline'].append((frame_ts, minions + jungle))
        stats['minions_killed'] = max(stats['minions_killed'], minions)
        stats['jungle_killed'] = max(stats['jungle_killed'], jungle)

        # CS por fase
        phase = get_phase(frame_ts)
        if phase == 'early':
            stats['cs_first_10min'] = minions + jungle
        elif phase == 'mid':
            stats['cs_10_20min'] = (minions + jungle) - stats['cs_first_10min']
        else:
            stats['cs_20_plus'] = (minions + jungle) - stats['cs_first_10min'] - stats['cs_10_20min']

        # Nível e XP
        level = p_data.get('level', 0)
        xp = p_data.get('xp', 0)
        stats['level_timeline'].append((frame_ts, level))
        stats['xp_timeline'].append((frame_ts, xp))
        stats['max_level'] = max(stats['max_level'], level)

        # Champion Stats
        if 'championStats' in p_data:
            champ_stats = p_data['championStats']

            stats['health_timeline'].append((frame_ts, champ_stats.get('health', 0)))
            stats['mana_or_power_timeline'].append((frame_ts, champ_stats.get('power', 0) or champ_stats.get('resource', 0)))
            stats['attack_damage_timeline'].append((frame_ts, champ_stats.get('attackDamage', 0)))
            stats['ability_power_timeline'].append((frame_ts, champ_stats.get('abilityPower', 0)))
            stats['attack_speed_timeline'].append((frame_ts, champ_stats.get('attackSpeed', 0)))
            stats['armor_timeline'].append((frame_ts, champ_stats.get('armor', 0)))
            stats['magic_resist_timeline'].append((frame_ts, champ_stats.get('magicResist', 0)))
            stats['movement_speed_timeline'].append((frame_ts, champ_stats.get('movementSpeed', 0)))

        # Damage Stats
        if 'damageStats' in p_data:
            dmg_stats = p_data['damageStats']

            phys_dmg = dmg_stats.get('physicalDamageDone', 0)
            magic_dmg = dmg_stats.get('magicDamageDone', 0)
            true_dmg = dmg_stats.get('trueDamageDone', 0)
            total_dmg = dmg_stats.get('totalDamageDone', 0)
            dmg_to_champs = dmg_stats.get('totalDamageDoneToChampions', 0)

            stats['physical_damage'] = max(stats['physical_damage'], phys_dmg)
            stats['magic_damage'] = max(stats['magic_damage'], magic_dmg)
            stats['true_damage'] = max(stats['true_damage'], true_dmg)
            stats['damage_dealt_total'] = max(stats['damage_dealt_total'], total_dmg)
            stats['damage_dealt_to_champs'] = max(stats['damage_dealt_to_champs'], dmg_to_champs)
            stats['damage_dealt_to_champs_timeline'].append((frame_ts, dmg_to_champs))

            # Damage taken
            phys_taken = dmg_stats.get('physicalDamageTaken', 0)
            magic_taken = dmg_stats.get('magicDamageTaken', 0)
            true_taken = dmg_stats.get('trueDamageTaken', 0)
            total_taken = dmg_stats.get('totalDamageTaken', 0)

            stats['physical_damage_taken'] = max(stats['physical_damage_taken'], phys_taken)
            stats['magic_damage_taken'] = max(stats['magic_damage_taken'], magic_taken)
            stats['true_damage_taken'] = max(stats['true_damage_taken'], true_taken)
            stats['damage_taken'] = max(stats['damage_taken'], total_taken)
            stats['damage_taken_timeline'].append((frame_ts, total_taken))

        # Posição
        if 'position' in p_data:
            pos = p_data['position']
            stats['positions'].append((pos.get('x'), pos.get('y'), frame_ts))

        # Tempo CC
        if 'timeEnemySpentControlled' in p_data:
            stats['time_enemy_spent_controlled'] = max(
                stats['time_enemy_spent_controlled'],
                p_data['timeEnemySpentControlled']
            )

    # Processar eventos do frame
    events = frame.get('events', [])

    for event in events:
        event_type = event.get('type')
        event_ts = event.get('timestamp', frame_ts)

        # === WARD_PLACED ===
        if event_type == 'WARD_PLACED':
            creator_id = event.get('creatorId')
            if creator_id in player_stats:
                ward_type = event.get('wardType', 'UNDEFINED')
                player_stats[creator_id]['wards_placed'] += 1
                player_stats[creator_id]['wards_placed_timeline'].append(event_ts)
                player_stats[creator_id]['wards_by_type'][ward_type] += 1

                if ward_type == 'CONTROL_WARD':
                    player_stats[creator_id]['pink_wards_placed'] += 1

        # === WARD_KILL ===
        elif event_type == 'WARD_KILL':
            killer_id = event.get('killerId')
            if killer_id in player_stats:
                ward_type = event.get('wardType', 'UNDEFINED')
                player_stats[killer_id]['wards_killed'] += 1
                player_stats[killer_id]['wards_killed_timeline'].append(event_ts)

                if ward_type == 'CONTROL_WARD':
                    player_stats[killer_id]['pink_wards_killed'] += 1

        # === CHAMPION_KILL ===
        elif event_type == 'CHAMPION_KILL':
            killer_id = event.get('killerId')
            victim_id = event.get('victimId')
            assisters = event.get('assistingParticipantIds', [])
            bounty = event.get('bounty', 0)

            # Primeiro sangue
            if first_blood_killer is None:
                first_blood_killer = killer_id
                first_blood_victim = victim_id
                player_stats[killer_id]['first_blood'] = True
                player_stats[victim_id]['first_blood_participant'] = True  # Tomou FB

            # Killer
            if killer_id in player_stats and killer_id != 0:
                player_stats[killer_id]['kills'] += 1
                player_stats[killer_id]['kill_timeline'].append(event_ts)
                if bounty > 0:
                    player_stats[killer_id]['bounty_gold'] += bounty

                # Kills por fase
                phase = get_phase(event_ts)
                if phase == 'early':
                    player_stats[killer_id]['kills_first_10min'] += 1

            # Victim
            if victim_id in player_stats:
                player_stats[victim_id]['deaths'] += 1
                player_stats[victim_id]['death_timeline'].append(event_ts)

                # Deaths por fase
                phase = get_phase(event_ts)
                if phase == 'early':
                    player_stats[victim_id]['deaths_first_10min'] += 1

            # Assisters
            for assister_id in assisters:
                if assister_id in player_stats:
                    player_stats[assister_id]['assists'] += 1
                    player_stats[assister_id]['assist_timeline'].append(event_ts)

        # === CHAMPION_SPECIAL_KILL ===
        elif event_type == 'CHAMPION_SPECIAL_KILL':
            killer_id = event.get('killerId')
            kill_type = event.get('killType')
            multi_kill_length = event.get('multiKillLength', 0)

            if killer_id in player_stats:
                if kill_type == 'KILL_FIRST_BLOOD':
                    player_stats[killer_id]['first_blood'] = True

                if multi_kill_length >= 2:
                    kill_names = {2: 'DOUBLE', 3: 'TRIPLE', 4: 'QUADRA', 5: 'PENTA'}
                    player_stats[killer_id]['multi_kills'][kill_names.get(multi_kill_length, f'{multi_kill_length}KILL')] += 1

        # === LEVEL_UP ===
        elif event_type == 'LEVEL_UP':
            p_id = event.get('participantId')
            level = event.get('level')
            if p_id in player_stats:
                player_stats[p_id]['level_ups'].append((event_ts, level))

        # === SKILL_LEVEL_UP ===
        elif event_type == 'SKILL_LEVEL_UP':
            p_id = event.get('participantId')
            slot = event.get('skillSlot')
            if p_id in player_stats:
                player_stats[p_id]['skill_ups'][slot] += 1
                player_stats[p_id]['skill_order'].append((event_ts, slot))

        # === ITEM_PURCHASED ===
        elif event_type == 'ITEM_PURCHASED':
            p_id = event.get('participantId')
            item_id = event.get('itemId')
            if p_id in player_stats and item_id > 0:  # item_id 0 é venda/consumo
                player_stats[p_id]['items_purchased'].append(item_id)
                player_stats[p_id]['items_purchased_timeline'].append((event_ts, item_id))
                player_stats[p_id]['total_items_bought'] += 1

        # === ITEM_SOLD ===
        elif event_type == 'ITEM_SOLD':
            p_id = event.get('participantId')
            item_id = event.get('itemId')
            if p_id in player_stats:
                player_stats[p_id]['items_sold'].append(item_id)
                player_stats[p_id]['items_sold_timeline'].append((event_ts, item_id))

        # === ITEM_DESTROYED ===
        elif event_type == 'ITEM_DESTROYED':
            p_id = event.get('participantId')
            item_id = event.get('itemId')
            if p_id in player_stats:
                player_stats[p_id]['items_destroyed'].append(item_id)

        # === ITEM_UNDO ===
        elif event_type == 'ITEM_UNDO':
            p_id = event.get('participantId')
            before_id = event.get('beforeId')
            gold_gain = event.get('goldGain', 0)
            if p_id in player_stats:
                player_stats[p_id]['item_undo'].append((event_ts, before_id, gold_gain))

        # === TURRET_PLATE_DESTROYED ===
        elif event_type == 'TURRET_PLATE_DESTROYED':
            killer_id = event.get('killerId')
            if killer_id in player_stats:
                player_stats[killer_id]['turrets_plates_destroyed'] += 1

        # === BUILDING_KILL ===
        elif event_type == 'BUILDING_KILL':
            killer_id = event.get('killerId')
            assisters = event.get('assistingParticipantIds', [])
            building_type = event.get('buildingType')
            bounty = event.get('bounty', 0)

            if killer_id in player_stats:
                if building_type == 'TOWER_BUILDING':
                    player_stats[killer_id]['turrets_killed_participation'] += 1
                if bounty > 0:
                    player_stats[killer_id]['shutdown_gold_earned'] += bounty

            for assister_id in assisters:
                if assister_id in player_stats:
                    if building_type == 'TOWER_BUILDING':
                        player_stats[assister_id]['turrets_killed_participation'] += 1

        # === ELITE_MONSTER_KILL ===
        elif event_type == 'ELITE_MONSTER_KILL':
            killer_id = event.get('killerId')
            assisters = event.get('assistingParticipantIds', [])
            monster_type = event.get('monsterType')  # DRAGON, BARON_NASHOR, RIFTHERALD
            monster_sub_type = event.get('monsterSubType', '')

            if killer_id in player_stats:
                if monster_type == 'DRAGON':
                    player_stats[killer_id]['dragon_kills_participation'] += 1
                elif monster_type == 'BARON_NASHOR':
                    player_stats[killer_id]['baron_kills_participation'] += 1
                elif monster_type == 'RIFTHERALD':
                    player_stats[killer_id]['herald_kills_participation'] += 1

            for assister_id in assisters:
                if assister_id in player_stats:
                    if monster_type == 'DRAGON':
                        player_stats[assister_id]['dragon_kills_participation'] += 1
                    elif monster_type == 'BARON_NASHOR':
                        player_stats[assister_id]['baron_kills_participation'] += 1

        # === GAME_END ===
        elif event_type == 'GAME_END':
            winning_team = event.get('winningTeam')
            for p_id in player_stats:
                player_stats[p_id]['victory'] = (player_stats[p_id]['team'] == winning_team)

# ============================================================================
# CÁLCULOS DERIVADOS
# ============================================================================

team_total_kills = {100: 0, 200: 0}
for p_id in range(1, 11):
    team_total_kills[player_stats[p_id]['team']] += player_stats[p_id]['kills']

for p_id in range(1, 11):
    stats = player_stats[p_id]

    # CS por minuto
    if stats['cs_timeline']:
        final_cs = stats['cs_timeline'][-1][1] if stats['cs_timeline'] else 0
        stats['cs_per_min'] = final_cs / game_duration_min if game_duration_min > 0 else 0

    # Kill participation
    team_kills = team_total_kills[stats['team']]
    if team_kills > 0:
        stats['kill_participation'] = ((stats['kills'] + stats['assists']) / team_kills) * 100

    # KDA
    deaths = stats['deaths'] if stats['deaths'] > 0 else 1
    stats['kda'] = (stats['kills'] + stats['assists']) / deaths
    stats['kda_display'] = f"{stats['kills']}/{stats['deaths']}/{stats['assists']}"

    # Gold efficiency (dano por gold ganho)
    if stats['gold_timeline']:
        total_gold = stats['gold_timeline'][-1][2] if stats['gold_timeline'] else 1
        stats['gold_efficiency'] = stats['damage_dealt_to_champs'] / total_gold if total_gold > 0 else 0

    # Dano por minuto
    if stats['damage_dealt_to_champs_timeline']:
        final_dmg = stats['damage_dealt_to_champs_timeline'][-1][1]
        stats['damage_per_min'] = final_dmg / game_duration_min if game_duration_min > 0 else 0

    # Taxa de sobrevivência de wards (estimada)
    if stats['wards_placed'] > 0:
        stats['ward_survival_rate'] = (stats['wards_placed'] - stats['wards_killed']) / stats['wards_placed'] * 100

    # Score de visão estimado (wards * 1 + kills * 0.5)
    stats['vision_score'] = stats['wards_placed'] + (stats['wards_killed'] * 0.5)

    # Tempo até primeiro item (aproximado)
    if stats['items_purchased_timeline']:
        stats['first_item_time'] = stats['items_purchased_timeline'][0][0] / 1000 / 60

    # Build final
    if len(stats['items_purchased']) >= 6:
        stats['full_build_time'] = stats['items_purchased_timeline'][5][0] / 1000 / 60

# ============================================================================
# IMPRIMIR RELATÓRIO DETALHADO
# ============================================================================

def print_separator(char='-', length=80):
    print(char * length)

def format_number(num, decimals=1):
    return f"{num:.{decimals}f}".rstrip('0').rstrip('.')

for p_id in range(1, 11):
    s = player_stats[p_id]

    print_separator('=')
    print(f" JOGADOR {p_id} - Time {s['team']} ({s['team_side']})")
    print(f" Resultado: {'VITÓRIA' if s.get('victory', False) else 'DERROTA'}")
    print_separator('=')

    # === RESUMO GERAL ===
    print("\n[ RESUMO GERAL ]")
    print(f"  Nível Final: {s['max_level']}")
    print(f"  KDA: {s['kda_display']} ({format_number(s['kda'], 2)})")
    print(f"  CS: {s['minions_killed'] + s['jungle_killed']} ({s['minions_killed']} minions + {s['jungle_killed']} jungle)")
    print(f"  CS/min: {format_number(s['cs_per_min'], 1)}")
    print(f"  Gold Final: {s['gold_timeline'][-1][1] if s['gold_timeline'] else 0}")

    # === COMBATE ===
    print("\n[ COMBATE ]")
    print(f"  Kills: {s['kills']}")
    print(f"  Deaths: {s['deaths']}")
    print(f"  Assists: {s['assists']}")
    print(f"  Kill Participation: {format_number(s['kill_participation'], 1)}%")
    print(f"  Primeiro Sangue: {'SIM' if s['first_blood'] else 'não'}")
    print(f"  Kills Early (0-10min): {s['kills_first_10min']}")
    print(f"  Deaths Early (0-10min): {s['deaths_first_10min']}")
    if s['multi_kills']:
        print(f"  Multi-Kills: {dict(s['multi_kills'])}")
    print(f"  Bounty Gold: {s['bounty_gold']}")
    print(f"  Shutdown Gold: {s['shutdown_gold_earned']}")

    # Timeline de kills
    if s['kill_timeline']:
        print(f"  Timeline Kills: {[f'{t//60000}min' for t in s['kill_timeline']]}")
    if s['death_timeline']:
        print(f"  Timeline Deaths: {[f'{t//60000}min' for t in s['death_timeline']]}")

    # === DANO ===
    print("\n[ DANO ]")
    print(f"  Dano Total Causado: {s['damage_dealt_total']:,}")
    print(f"  Dano a Campeões: {s['damage_dealt_to_champs']:,}")
    print(f"  Dano/min a Campeões: {format_number(s.get('damage_per_min', 0), 0)}")
    print(f"  Dano Físico: {s['physical_damage']:,}")
    print(f"  Dano Mágico: {s['magic_damage']:,}")
    print(f"  Dano Verdadeiro: {s['true_damage']:,}")
    print(f"  Dano Recebido: {s['damage_taken']:,}")
    print(f"  Dano Físico Recebido: {s['physical_damage_taken']:,}")
    print(f"  Dano Mágico Recebido: {s['magic_damage_taken']:,}")
    print(f"  Gold Efficiency (Dano/Ouro): {format_number(s['gold_efficiency'], 2)}")

    # === GOLD ===
    print("\n[ ECONOMIA ]")
    if s['gold_timeline']:
        final_gold = s['gold_timeline'][-1]
        print(f"  Gold Atual Final: {final_gold[1]}")
        print(f"  Gold Total Ganho: {final_gold[2]}")

        # Crescimento de gold
        if len(s['gold_timeline']) >= 2:
            gold_start = s['gold_timeline'][0][2]
            gold_end = s['gold_timeline'][-1][2]
            gold_growth = gold_end - gold_start
            print(f"  Crescimento Gold: {gold_growth:,}")

    print(f"  Itens Comprados: {s['total_items_bought']}")
    print(f"  Itens Vendidos: {len(s['items_sold'])}")
    print(f"  Itens Destruidos (consumíveis): {len(s['items_destroyed'])}")

    # Timeline de compras
    if s['items_purchased_timeline']:
        print(f"  Primeira Compra: {s['items_purchased_timeline'][0][0]/1000/60:.1f}min (Item {s['items_purchased_timeline'][0][1]})")

    # Top 5 itens comprados
    if s['items_purchased']:
        item_counts = Counter(s['items_purchased'])
        print(f"  Itens Mais Comprados: {item_counts.most_common(5)}")

    # CS por fase
    print("\n[ FARMING ]")
    print(f"  CS 0-10min: {s['cs_first_10min']}")
    print(f"  CS 10-20min: {s['cs_10_20min']}")
    print(f"  CS 20+min: {s['cs_20_plus']}")
    print(f"  CS/min: {format_number(s['cs_per_min'], 1)}")

    # === WARDS ===
    print("\n[ VISÃO ]")
    print(f"  Wards Colocadas: {s['wards_placed']}")
    print(f"  Wards Mortas (inimigas): {s['wards_killed']}")
    print(f"  Wards Tipo: {dict(s['wards_by_type'])}")
    print(f"  Pink Wards Colocadas: {s['pink_wards_placed']}")
    print(f"  Pink Wards Mortas: {s['pink_wards_killed']}")
    print(f"  Vision Score (estimado): {format_number(s['vision_score'], 1)}")
    if 'ward_survival_rate' in s:
        print(f"  Taxa Sobrevivência Wards: {format_number(s['ward_survival_rate'], 1)}%")

    # Timeline de wards
    if s['wards_placed_timeline']:
        ward_times = [t//60000 for t in s['wards_placed_timeline']]
        ward_freq = Counter(ward_times)
        print(f"  Wards por minuto (top 5): {ward_freq.most_common(5)}")

    # === HABILIDADES ===
    print("\n[ HABILIDADES ]")
    skill_order = s['skill_order']
    if skill_order:
        print(f"  Ordem de Up: {[(f'{t//60000}min', f'Slot {slot}') for t, slot in skill_order[:10]]}")

    skill_ups = s['skill_ups']
    print(f"  Ups por Skill: Q({skill_ups.get(1,0)}) W({skill_ups.get(2,0)}) E({skill_ups.get(3,0)}) R({skill_ups.get(4,0)})")

    # === OBJETIVOS ===
    print("\n[ OBJETIVOS ]")
    print(f"  Placas de Torre Destruídas: {s['turrets_plates_destroyed']}")
    print(f"  Participação Torres: {s['turrets_killed_participation']}")
    print(f"  Participação Dragons: {s['dragon_kills_participation']}")
    print(f"  Participação Baron: {s['baron_kills_participation']}")
    print(f"  Participação Herald: {s['herald_kills_participation']}")

    # === STATS DE CAMPEÃO (Final) ===
    print("\n[ STATS FINAIS DO CAMPEÃO ]")
    if s['health_timeline']:
        print(f"  HP: {s['health_timeline'][-1][1]}")
    if s['attack_damage_timeline']:
        print(f"  AD: {s['attack_damage_timeline'][-1][1]}")
    if s['ability_power_timeline']:
        print(f"  AP: {s['ability_power_timeline'][-1][1]}")
    if s['armor_timeline']:
        print(f"  Armadura: {s['armor_timeline'][-1][1]}")
    if s['magic_resist_timeline']:
        print(f"  RM: {s['magic_resist_timeline'][-1][1]}")
    if s['movement_speed_timeline']:
        print(f"  MS: {s['movement_speed_timeline'][-1][1]}")

    # === CC ===
    print("\n[ CONTROLE E CROWD CONTROL ]")
    print(f"  Tempo CC Infligido: {s['time_enemy_spent_controlled']}s")

    print("\n")

# ============================================================================
# COMPARATIVO ENTRE TIMES
# ============================================================================
print_separator('=')
print(" COMPARATIVO ENTRE TIMES")
print_separator('=')

team_stats = {100: {'kills': 0, 'deaths': 0, 'gold': 0, 'cs': 0, 'damage': 0, 'wards': 0},
              200: {'kills': 0, 'deaths': 0, 'gold': 0, 'cs': 0, 'damage': 0, 'wards': 0}}

for p_id in range(1, 11):
    s = player_stats[p_id]
    team = s['team']
    team_stats[team]['kills'] += s['kills']
    team_stats[team]['deaths'] += s['deaths']
    team_stats[team]['wards'] += s['wards_placed']
    team_stats[team]['damage'] += s['damage_dealt_to_champs']
    if s['cs_timeline']:
        team_stats[team]['cs'] += s['cs_timeline'][-1][1]
    if s['gold_timeline']:
        team_stats[team]['gold'] += s['gold_timeline'][-1][2]

print(f"\n{'Métrica':<20} {'Time 100 (Blue)':<20} {'Time 200 (Red)':<20}")
print_separator('-', 60)
print(f"{'Kills':<20} {team_stats[100]['kills']:<20} {team_stats[200]['kills']:<20}")
print(f"{'Deaths':<20} {team_stats[100]['deaths']:<20} {team_stats[200]['deaths']:<20}")
print(f"{'KDA':<20} {team_stats[100]['kills']/max(team_stats[100]['deaths'],1):<20.2f} {team_stats[200]['kills']/max(team_stats[200]['deaths'],1):<20.2f}")
print(f"{'Gold Total':<20} {team_stats[100]['gold']:<20,} {team_stats[200]['gold']:<20,}")
print(f"{'CS Total':<20} {team_stats[100]['cs']:<20} {team_stats[200]['cs']:<20}")
print(f"{'Dano a Campeões':<20} {team_stats[100]['damage']:<20,} {team_stats[200]['damage']:<20,}")
print(f"{'Wards Colocadas':<20} {team_stats[100]['wards']:<20} {team_stats[200]['wards']:<20}")

print("\n" + "=" * 80)
print(" Análise concluída!")
print("=" * 80)

# Exportar para JSON
output = {
    'match_id': match_id,
    'game_duration_minutes': game_duration_min,
    'players': player_stats
}

with open('player_stats_detailed.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, default=str)

print(f"\nEstatísticas exportadas para: player_stats_detailed.json")
