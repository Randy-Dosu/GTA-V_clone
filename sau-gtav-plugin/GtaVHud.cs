using SanAndreasUnity.Behaviours;
using UnityEngine;

namespace SanAndreasUnity.GtaV
{
    /// <summary>
    /// Always-on GTA V-style HUD (plain IMGUI, independent of the pause menu):
    /// cash (top right, V green), character tag, active mission objective bar
    /// (bottom center) and the MISSION PASSED / character-switch banner.
    /// </summary>
    public class GtaVHud : MonoBehaviour
    {
        private float _bannerTimeLeft;
        private string _bannerText = string.Empty;

        private GUIStyle _cashStyle;
        private GUIStyle _tagStyle;
        private GUIStyle _objectiveStyle;
        private GUIStyle _bannerStyle;

        private void Start()
        {
            var state = GtaVGameMode.Instance.State;
            state.MoneyChanged += OnMoneyChanged;
            state.CharacterChanged += OnCharacterChanged;
        }

        private void OnDestroy()
        {
            if (null != GtaVGameMode.Instance)
            {
                var state = GtaVGameMode.Instance.State;
                state.MoneyChanged -= OnMoneyChanged;
                state.CharacterChanged -= OnCharacterChanged;
            }
        }

        private void OnMoneyChanged(int money) => ShowBanner($"${money}");

        private void OnCharacterChanged(string name) => ShowBanner(name.ToUpperInvariant());

        private void ShowBanner(string text)
        {
            _bannerText = text;
            _bannerTimeLeft = 2.4f;
        }

        private void Update()
        {
            if (_bannerTimeLeft > 0f) _bannerTimeLeft -= Time.deltaTime;
        }

        private void OnGUI()
        {
            if (null == Ped.Instance || null == GtaVGameMode.Instance)
                return; // world not loaded — keep the screen clean

            EnsureStyles();
            var state = GtaVGameMode.Instance.State;

            // ---- Cash, top right, GTA V green ----
            GUI.Label(new Rect(Screen.width - 220f, 8f, 210f, 32f), $"${state.Money}", _cashStyle);

            // ---- Character tag under cash ----
            GUI.Label(new Rect(Screen.width - 220f, 40f, 210f, 22f), state.CurrentCharacterName, _tagStyle);

            // ---- Mission objective bar, bottom center ----
            var runner = GtaVGameMode.Instance.GetComponent<MissionRunner>();
            if (runner != null && runner.HasActiveMission)
            {
                var rect = new Rect(Screen.width * 0.5f - 320f, Screen.height - 64f, 640f, 40f);
                GUI.Box(rect, string.Empty);
                GUI.Label(rect, runner.ActiveObjectiveText, _objectiveStyle);
            }

            // ---- Mission passed / money banner, center ----
            if (_bannerTimeLeft > 0f)
            {
                _bannerStyle.normal.textColor = new Color(1f, 0.92f, 0.4f, Mathf.Clamp01(_bannerTimeLeft));
                GUI.Label(
                    new Rect(Screen.width * 0.5f - 300f, Screen.height * 0.32f, 600f, 70f),
                    _bannerText,
                    _bannerStyle);
            }
        }

        private void EnsureStyles()
        {
            if (_cashStyle != null) return;

            _cashStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 24,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.UpperRight,
            };
            _cashStyle.normal.textColor = new Color(0.45f, 0.82f, 0.35f);

            _tagStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 13,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.UpperRight,
            };
            _tagStyle.normal.textColor = Color.white;

            _objectiveStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 15,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleCenter,
            };
            _objectiveStyle.normal.textColor = new Color(1f, 0.92f, 0.6f);

            _bannerStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 42,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleCenter,
            };
            _bannerStyle.normal.textColor = new Color(1f, 0.92f, 0.4f, 1f);
        }
    }
}
