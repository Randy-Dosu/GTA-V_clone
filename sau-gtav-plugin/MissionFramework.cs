using System;
using System.Collections.Generic;
using SanAndreasUnity.Behaviours;
using SanAndreasUnity.Behaviours.Peds;
using UnityEngine;

namespace SanAndreasUnity.GtaV
{
    /// <summary>A single objective inside a mission.</summary>
    [Serializable]
    public class MissionStage
    {
        public string ObjectiveText;
        public Vector3 TargetPosition;
        public float ArriveRadius = 6f;
        /// <summary>Ped model to spawn at the target (0 = none), e.g. a mission giver.</summary>
        public int SpawnPedAtTarget;
        /// <summary>Seconds before failure (0 = untimed).</summary>
        public float TimeLimitSeconds;
    }

    /// <summary>Data-driven mission definition — add missions without touching code paths.</summary>
    [Serializable]
    public class MissionDef
    {
        public string Name;
        public string Giver;
        public int Reward;
        public MissionStage[] Stages;
    }

    /// <summary>
    /// Runs missions: spawns givers, tracks stage progression by proximity,
    /// draws world markers, enforces timers, pays rewards & shows the
    /// MISSION PASSED banner. All through SAU's own ped spawning & world APIs.
    /// </summary>
    public class MissionRunner : MonoBehaviour
    {
        public static readonly List<MissionDef> DefaultMissions = new List<MissionDef>
        {
            new MissionDef
            {
                Name = "Repo Man",
                Giver = "Simeon",
                Reward = 1500,
                Stages = new[]
                {
                    new MissionStage { ObjectiveText = "Drive to the dealership downtown.", TargetPosition = new Vector3(20f, 0f, 120f), SpawnPedAtTarget = 289 },
                    new MissionStage { ObjectiveText = "Deliver any vehicle to the impound.", TargetPosition = new Vector3(-180f, 0f, -30f), ArriveRadius = 8f },
                },
            },
            new MissionDef
            {
                Name = "Vinewood Night Out",
                Giver = "Lester",
                Reward = 2500,
                Stages = new[]
                {
                    new MissionStage { ObjectiveText = "Pick up Lester in Vinewood.", TargetPosition = new Vector3(-60f, 0f, -140f), SpawnPedAtTarget = 1 },
                    new MissionStage { ObjectiveText = "Drive him to the observatory overlook.", TargetPosition = new Vector3(-15f, 0f, -350f), ArriveRadius = 10f, TimeLimitSeconds = 180f },
                },
            },
            new MissionDef
            {
                Name = "Pier Run",
                Giver = "Hao",
                Reward = 1000,
                Stages = new[]
                {
                    new MissionStage { ObjectiveText = "Sprint to the beach helipad before time expires.", TargetPosition = new Vector3(-270f, 0f, 185f), ArriveRadius = 9f, TimeLimitSeconds = 120f },
                },
            },
        };

        public bool HasActiveMission => _active != null;
        public MissionDef ActiveMissionName => _active;
        public string ActiveObjectiveText =>
            HasActiveMission ? _active.Stages[_stage].ObjectiveText + TimerSuffix() : string.Empty;

        private MissionDef _active;
        private int _stage;
        private float _stageDeadline;
        private GameObject _marker;
        private readonly List<Ped> _spawnedActors = new List<Ped>();

        private void Update()
        {
            if (!HasActiveMission || null == Ped.Instance) return;
            var playerPos = Ped.Instance.transform.position;
            var stage = _active.Stages[_stage];

            // Timer
            if (stage.TimeLimitSeconds > 0f && Time.time > _stageDeadline)
            {
                AbortActiveMission("Out of time");
                return;
            }

            // Arrival check
            var target = stage.TargetPosition;
            bool arrived = Vector2.Distance(
                new Vector2(playerPos.x, playerPos.z),
                new Vector2(target.x, target.z)) <= stage.ArriveRadius;
            if (!arrived) return;

            Destroy(_marker);
            _marker = null;
            _stage++;

            if (_stage >= _active.Stages.Length)
                CompleteMission();
            else
                EnterStage();
        }

        public void StartMission(MissionDef def)
        {
            if (HasActiveMission || null == Ped.Instance) return;
            _active = def;
            _stage = 0;
            EnterStage();
            Debug.Log($"[GtaV] Mission started: {def.Name}");
        }

        public void AbortActiveMission(string reason = "Aborted")
        {
            if (!HasActiveMission) return;
            Cleanup();
            Debug.Log($"[GtaV] Mission failed: {reason}");
        }

        private void EnterStage()
        {
            var stage = _active.Stages[_stage];
            if (stage.TimeLimitSeconds > 0f)
                _stageDeadline = Time.time + stage.TimeLimitSeconds;

            // Mission giver NPC at the target
            if (stage.SpawnPedAtTarget > 0 && null != Ped.Instance)
            {
                var pos = stage.TargetPosition + new Vector3(1.5f, 0.1f, 0f);
                var ped = Ped_Spawning.SpawnPed(stage.SpawnPedAtTarget, pos, Quaternion.identity, false);
                if (null != ped) _spawnedActors.Add(ped);
            }

            // GTA V yellow objective marker (non-solid so it never blocks movement)
            if (null == _marker)
            {
                _marker = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                _marker.name = "GtaVObjectiveMarker";
                Destroy(_marker.GetComponent<Collider>());
                _marker.transform.localScale = new Vector3(2.6f, 0.4f, 2.6f);
                _marker.transform.position = stage.TargetPosition + new Vector3(0f, 0.6f, 0f);
                var mr = _marker.GetComponent<MeshRenderer>();
                mr.material.color = new Color(1f, 0.84f, 0.1f, 1f);
            }
            else
            {
                _marker.transform.position = stage.TargetPosition + new Vector3(0f, 0.6f, 0f);
            }
        }

        private void CompleteMission()
        {
            int reward = _active.Reward;
            GtaVGameMode.Instance.State.AddMoney(reward);
            Debug.Log($"[GtaV] MISSION PASSED — {_active.Name} (+${reward})");
            Cleanup();
        }

        private void Cleanup()
        {
            _active = null;
            _stage = 0;
            if (null != _marker) Destroy(_marker);
            _marker = null;
            foreach (var actor in _spawnedActors)
                if (null != actor) Destroy(actor.gameObject);
            _spawnedActors.Clear();
        }

        private string TimerSuffix()
        {
            if (!HasActiveMission) return string.Empty;
            var stage = _active.Stages[_stage];
            if (stage.TimeLimitSeconds <= 0f) return string.Empty;
            int left = Mathf.Max(0, Mathf.CeilToInt(_stageDeadline - Time.time));
            return $"   [{left / 60:0}:{left % 60:00}]";
        }
    }
}
