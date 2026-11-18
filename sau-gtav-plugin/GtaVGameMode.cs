using System.Collections.Generic;
using SanAndreasUnity.Behaviours;
using SanAndreasUnity.GameModes;
using SanAndreasUnity.Net;
using SanAndreasUnity.UI;
using UGameCore.Utilities;
using UnityEngine;

namespace SanAndreasUnity.GtaV
{
    /// <summary>
    /// GTA V-style plugin entrypoint. Registers the "GTA V" game mode with SAU's
    /// GameModeManager and bootstraps every manager on one persistent GameObject.
    /// </summary>
    public class GtaVGameMode : StartupSingleton<GtaVGameMode>
    {
        public static GtaVGameMode Instance => Singleton;

        /// <summary>Per-session state shared by all GTA V features.</summary>
        public GtaVState State { get; } = new GtaVState();

        protected override void OnSingletonEnable()
        {
            // Register with SAU's game mode system so it activates on server start
            var info = new GameModeManager.GameModeInfo(
                "GTA V",
                "GTA V-style gameplay: character switch, iFruit phone, missions & HUD",
                () => this.Activate()
            );
            if (!GameModeManager.Instance.GameModes.Contains(info))
                GameModeManager.Instance.RegisterGameMode(info);
        }

        private void Activate()
        {
            Debug.Log("[GtaV] Game mode activated");

            if (null == this.GetComponent<CharacterSwitchManager>())
                this.gameObject.AddComponent<CharacterSwitchManager>();
            if (null == this.GetComponent<MissionRunner>())
                this.gameObject.AddComponent<MissionRunner>();

            // Pause menu windows are plain MonoBehaviours — create & register them
            EnsureWindow<PhoneWindow>();
            EnsureWindow<GtaVHud>();
        }

        private void EnsureWindow<T>() where T : MonoBehaviour
        {
            if (null == FindObjectOfType<T>())
                this.gameObject.AddComponent<T>();
        }

        /// <summary>Run a command through SAU's own command pipeline (networked).</summary>
        public static void SendCommand(string command)
        {
            Chat.ChatManager.SendChatMessageToAllPlayersAsLocalPlayer(command);
        }
    }

    /// <summary>Shared session state (money, active character, etc.).</summary>
    public class GtaVState
    {
        public int Money = 350; // starter cash, GTA V style
        public string CurrentCharacterName = "Franklin";
        public event System.Action<int> MoneyChanged;
        public event System.Action<string> CharacterChanged;

        public void AddMoney(int amount)
        {
            Money += amount;
            MoneyChanged?.Invoke(Money);
        }

        public void SetCharacter(string name)
        {
            CurrentCharacterName = name;
            CharacterChanged?.Invoke(name);
        }
    }
}
