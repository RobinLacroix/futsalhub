#!/usr/bin/env python3
import csv
import uuid
import random
import json
from datetime import datetime, timedelta

# ---------------------
# CONFIG JOUEURS (id, nom, poste)
# ---------------------
players = [
    ("3ead9336-738f-49e8-a94f-714be9fd3431", "Alexandre Pezeron", "Meneur"),
    ("437901cc-63ae-4dd5-ab0e-d84076e529c1", "Johan Lecomte", "Gardien"),
    ("4bb12b82-3c06-4006-b854-b0b946b57938", "Jean Rasamimanana", "Ailier"),
    ("551cd810-e6d3-4196-b540-557bdee0386a", "Ange Tsendou", "Ailier"),
    ("57f5858d-a561-4e84-b86b-20fe0ee2c00f", "Jordan Birba", "Ailier"),
    ("6b3978a3-97ec-4ae7-998b-435a0e681d80", "Hazem Nasr", "Ailier"),
    ("782aecb1-d49b-4a85-ac7f-cb19ff149672", "Yazid Ali Abdallah", "Ailier"),
    ("80405a0d-8bd4-42bc-bc52-624341e4053d", "André Domingues", "Gardien"),
    ("8b8d9730-f186-45cf-bdd7-59cbd0bd5f43", "Adrien Daniel", "Ailier"),
    ("9daaf59a-9649-4a15-b5af-ba9af96eb4bf", "Mehdi Boumezbeur", "Meneur"),
    ("a098feff-beb1-4fa4-92fb-28d31df0baa1", "Matteo Saraiva", "Ailier"),
    ("a824fa91-f2c5-4f5f-a948-dd2784076ebd", "Carlos Oliveira", "Meneur"),
    ("ac794b03-adc3-4ec0-9f1f-7e54fbb3719d", "Charles Douala", "Ailier"),
    ("b4b13f84-ffed-4331-81e8-8444f02d2a84", "Roby Makiady", "Ailier"),
    ("b4eaaba5-7f68-45ba-b4c0-0a4ab27db37d", "Imed Boudekhana", "Meneur"),
    ("bf71f67c-beb7-4fa8-bfd2-0ae15bb917c2", "Adame Agbessi", "Ailier"),
    ("d93beb94-b8a2-4b9c-8fa5-c403159ff629", "Léo Nguyen", "Gardien"),
    ("dae14bc1-822e-42ce-8484-dedb20fdf10d", "Nabil Mohamed Ben Ali", "Ailier"),
    ("db6ff543-a2ad-4dcd-a54f-561be815be11", "Thomas Jean Louis Dit Montout", "Meneur"),
    ("ed1b17ce-3770-49ed-b478-e6d91847e319", "Axel Benoist", "Gardien"),
    ("f84944a3-fea5-4571-b589-7e6cf37af286", "Mamadou Coulibaly", "Ailier")
]

# ---------------------
# Paramètres (tu peux ajuster)
# ---------------------
NUM_MATCHES = 25
MIN_EVENTS = 80
MAX_EVENTS = 120
ROT_MIN = 120  # secondes min rotation (2 min)
ROT_EXTRA = 60 # rotation add (=> 2-3 min)
SHOT_ON_TARGET_RATIO = 0.45  # prob qu'un tir soit cadré (hors buts)
# ---------------------

# Helper: choix 12 joueurs pour un match en forçant 2 gardiens si possible
def sample_match_players():
    keepers = [p for p in players if p[2] == "Gardien"]
    outfields = [p for p in players if p[2] != "Gardien"]
    if len(keepers) >= 2:
        k = random.sample(keepers, 2)
    else:
        k = random.sample(keepers, min(2, len(keepers)))
        while len(k) < 2:
            cand = random.choice(outfields)
            if cand not in k:
                k.append(cand)
    remaining = random.sample([p for p in players if p not in k], 10)
    out = {"keepers": [x[0] for x in k], "outfield": [x[0] for x in remaining], "full": [x[0] for x in (k + remaining)]}
    return out

# players on field : 1 gardien + 4 outfield, rotation toutes les rotation_time secondes
def get_on_field(match_players, tsec, rotation_time):
    idx = (tsec // rotation_time)
    keeper_choice = match_players["keepers"][idx % len(match_players["keepers"])]
    out_idx = (idx * 4) % len(match_players["outfield"])
    out_players = []
    for i in range(4):
        out_players.append(match_players["outfield"][(out_idx + i) % len(match_players["outfield"])])
    return [keeper_choice] + out_players

# helper to create an event dict
def make_event(match_id, etype, tsec, half, player_id, players_on_field):
    return {
        "id": str(uuid.uuid4()),
        "match_id": match_id,
        "event_type": etype,
        "match_time_seconds": tsec,
        "half": half,
        "player_id": player_id,
        "players_on_field": players_on_field,
        "created_at": datetime.utcnow().isoformat()
    }

# Crée un match et ses events cohérents
def generate_one_match(match_index):
    match_id = str(uuid.uuid4())
    date_match = (datetime(2025,9,1) + timedelta(days=match_index*3)).isoformat()

    # distribution buts pondérée
    r = random.random()
    if r < 0.1:
        total_goals = random.randint(2,5)
    elif r < 0.8:
        total_goals = random.randint(6,12)
    else:
        total_goals = random.randint(13,16)

    score_team = random.randint(0, total_goals)
    score_opp = total_goals - score_team
    opponent = f"Equipe {match_index+1}"

    # choose 12 players for this match
    match_players = sample_match_players()

    # initialize per-player stats for 'players' JSON in matches table
    per_player_stats = {pid: {"id": pid, "goals": 0, "red_cards": 0, "yellow_cards": 0} for pid in match_players["full"]}

    events = []
    rotation_time = ROT_MIN + random.randint(0, ROT_EXTRA)
    nb_events = random.randint(MIN_EVENTS, MAX_EVENTS)

    # 1) create goal events for team (with shot & shot_on_target)
    for _ in range(score_team):
        half = random.choice([1,2])
        tsec = random.randint(0,1200)
        on_field = get_on_field(match_players, tsec, rotation_time)
        possible_scorers = [p for p in on_field if p not in match_players["keepers"]]
        scorer = random.choice(possible_scorers) if possible_scorers else random.choice(on_field)
        events.append(make_event(match_id, "shot", tsec, half, scorer, on_field))
        events.append(make_event(match_id, "shot_on_target", tsec, half, scorer, on_field))
        events.append(make_event(match_id, "goal", tsec, half, scorer, on_field))
        per_player_stats[scorer]["goals"] += 1

    # 2) opponent goals
    for _ in range(score_opp):
        half = random.choice([1,2])
        tsec = random.randint(0,1200)
        events.append(make_event(match_id, "opponent_shot_on_target", tsec, half, None, []))
        events.append(make_event(match_id, "opponent_goal", tsec, half, None, []))

    # 3) create shots to reach a realistic number overall
    total_shots = random.randint(80, 120)
    shots_created = score_team  # shots already created from goals
    remaining_shots = max(0, total_shots - shots_created)
    for _ in range(remaining_shots):
        half = random.choice([1,2])
        tsec = random.randint(0,1200)
        if random.random() < 0.5:
            on_field = get_on_field(match_players, tsec, rotation_time)
            shooter_candidates = [p for p in on_field if p not in match_players["keepers"]]
            shooter = random.choice(shooter_candidates) if shooter_candidates else random.choice(on_field)
            if random.random() < SHOT_ON_TARGET_RATIO:
                events.append(make_event(match_id, "shot", tsec, half, shooter, on_field))
                events.append(make_event(match_id, "shot_on_target", tsec, half, shooter, on_field))
            else:
                events.append(make_event(match_id, "shot", tsec, half, shooter, on_field))
        else:
            if random.random() < SHOT_ON_TARGET_RATIO:
                events.append(make_event(match_id, "opponent_shot", tsec, half, None, []))
                events.append(make_event(match_id, "opponent_shot_on_target", tsec, half, None, []))
            else:
                events.append(make_event(match_id, "opponent_shot", tsec, half, None, []))

    # 4) recoveries and ball losses
    total