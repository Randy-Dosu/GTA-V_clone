using SanAndreasUnity.Behaviours;
using SanAndreasUnity.Behaviours.World;
using SanAndreasUnity.UI;
using UnityEngine;

namespace SanAndreasUnity.GtaV
{
    /// <summary>
    /// iFruit-style phone rendered as a pause-menu window: Mechanic (vehicle
    /// delivery), Missions, Clock and Stats apps.
    /// </summary>
    public class PhoneWindow : PauseMenuWindow
    {
        private enum App { Home, Contacts, Missions, Clock, Stats }
        private App _app = App.Home;

        private string _vehicleIdText = "522";
        private string _hoursText = "12";
        private Vector2 _scroll;

        private static readonly string[] ContactVehicles =
        {
            "522  — Sport bike",
            "411  — Exotic",
            "470  — SUV",
            "445  — Classic",
            "560  — Sedan",
            "433  — Pickup truck",
        };

        public PhoneWindow()
        {
            this.windowName = "GTA V";
        }

        private void Start()
        {
            this.RegisterButtonInPauseMenu();
            this.windowRect = new Rect(Screen.width * 0.72f, 10, 320, 470);
        }

        protected override void OnWindowGUI()
        {
            var switcher = GtaVGameMode.Instance != null
                ? GtaVGameMode.Instance.GetComponent<CharacterSwitchManager>()
                : null;

            // ---- Home screen ----
            GUILayout.Label($"Owner: {GtaVGameMode.Instance?.State.CurrentCharacterName ?? "-"}");
            GUILayout.Label($"Cash: ${GtaVGameMode.Instance?.State.Money ?? 0}");

            if (_app == App.Home)
            {
                GUILayout.Space(12);
                if (switcher != null && GUILayout.Button("Character Switch", GUILayout.Height(40)))
                    switcher.SwitchToNextCharacter();

                GUILayout.Space(4);
                if (GUILayout.Button("Contacts (Mechanic)", GUILayout.Height(40))) _app = App.Contacts;
                if (GUILayout.Button("Missions", GUILayout.Height(40))) _app = App.Missions;
                if (GUILayout.Button("Clock", GUILayout.Height(40))) _app = App.Clock;
                if (GUILayout.Button("Stats", GUILayout.Height(40))) _app = App.Stats;
                GUILayout.Space(8);
                GUILayout.Label("Press T in-game to switch character.");
                return;
            }

            if (GUILayout.Button("< Back", GUILayout.Height(26))) { _app = App.Home; return; }
            GUILayout.Space(8);
            _scroll = GUILayout.BeginScrollView(_scroll);

            if (_app == App.Contacts)
            {
                GUILayout.Label("MECHANIC — deliver a vehicle:");
                GUILayout.BeginHorizontal();
                GUILayout.Label("Model ID:", GUILayout.Width(64));
                _vehicleIdText = GUILayout.TextField(_vehicleIdText);
                if (GUILayout.Button("Send", GUILayout.Width(60)))
                    RequestVehicleDelivery(int.TryParse(_vehicleIdText, out int id) ? id : 522);
                GUILayout.EndHorizontal();

                GUILayout.Space(6);
                foreach (var entry in ContactVehicles)
                {
                    if (GUILayout.Button(entry, GUILayout.Height(28)))
                    {
                        int id = int.Parse(entry.Substring(0, entry.IndexOf(' ')));
                        _vehicleIdText = id.ToString();
                        RequestVehicleDelivery(id);
                    }
                }
            }
            else if (_app == App.Missions)
            {
                var runner = GtaVGameMode.Instance?.GetComponent<MissionRunner>();
                if (runner == null)
                {
                    GUILayout.Label("Mission runner unavailable.");
                }
                else if (runner.HasActiveMission)
                {
                    GUILayout.Label("ACTIVE: " + runner.ActiveMissionName);
                    GUILayout.Label(runner.ActiveObjectiveText);
                    if (GUILayout.Button("ABORT MISSION", GUILayout.Height(34)))
                        runner.AbortActiveMission();
                }
                else
                {
                    GUILayout.Label("Available jobs:");
                    foreach (var def in MissionRunner.DefaultMissions)
                    {
                        if (GUILayout.Button($"{def.Name}  —  ${def.Reward}", GUILayout.Height(32)))
                            runner.StartMission(def);
                    }
                }
            }
            else if (_app == App.Clock)
            {
                GUILayout.Label("Set world time:");
                GUILayout.BeginHorizontal();
                _hoursText = GUILayout.TextField(_hoursText);
                if (GUILayout.Button("Apply", GUILayout.Width(70)))
                {
                    if (byte.TryParse(_hoursText, out byte hours) && null != DayTimeManager.Singleton)
                        DayTimeManager.Singleton.SetTime(hours, 0, true);
                }
                GUILayout.EndHorizontal();
                if (null != DayTimeManager.Singleton)
                    GUILayout.Label(
                        $"Now: {DayTimeManager.Singleton.CurrentTimeHours}:{DayTimeManager.Singleton.CurrentTimeMinutes:00}");
            }
            else if (_app == App.Stats)
            {
                var s = GtaVGameMode.Instance.State;
                GUILayout.Label($"Cash: ${s.Money}");
                GUILayout.Label($"Character: {s.CurrentCharacterName}");
                GUILayout.Label($"Missions passed: {s.Money / 500}");
            }

            GUILayout.EndScrollView();
        }

        private void RequestVehicleDelivery(int vehicleId)
        {
            var ped = Ped.Instance;
            if (null == ped)
            {
                Debug.LogWarning("[GtaV] No local ped yet — mechanic unavailable");
                return;
            }
            var vehicle = SanAndreasUnity.Behaviours.Vehicles.Vehicle.CreateInFrontOf(vehicleId, ped.transform);
            Debug.Log(vehicle != null
                ? $"[GtaV] Mechanic delivered vehicle {vehicleId}"
                : $"[GtaV] Vehicle model {vehicleId} not found");
        }
    }
}
