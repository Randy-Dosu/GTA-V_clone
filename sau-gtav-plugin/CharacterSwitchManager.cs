using System.Collections.Generic;
using SanAndreasUnity.Behaviours;
using SanAndreasUnity.Behaviours.Peds;
using SanAndreasUnity.UI;
using UnityEngine;

namespace SanAndreasUnity.GtaV
{
    /// <summary>
    /// GTA V-style character switch: three protagonists, each with a name, spawn
    /// position, signature SA ped model and signature vehicle. Press T (or the
    /// phone) to cycle — the local ped's model swaps through SAU's /skin command,
    /// and the other protagonists hang out in town as ambient NPCs.
    /// </summary>
    public class CharacterSwitchManager : MonoBehaviour
    {
        public class Protagonist
        {
            public string Name;
            public int PedModelId;
            public int SignatureVehicleId;
            public Vector3 HangoutPosition;

            public Protagonist(string name, int pedModelId, int vehicleId, Vector3 hangout)
            {
                Name = name;
                PedModelId = pedModelId;
                SignatureVehicleId = vehicleId;
                HangoutPosition = hangout;
            }
        }

        [Header("Switch settings")]
        public KeyCode switchKey = KeyCode.T;

        /// <summary>SA ped model IDs — reconfigure in the GTA V pause window.</summary>
        public List<Protagonist> Protagonists = new List<Protagonist>
        {
            new Protagonist("Franklin", 0, 470, new Vector3(48, 0, -86)),   // CJ model, Comet-ish
            new Protagonist("Michael", 12, 522, new Vector3(-120, 0, -40)), // suit-ish model, sport bike
            new Protagonist("Trevor", 154, 445, new Vector3(-230, 0, 20)),  // scruffy model, pickup
        };

        private int _currentIndex;
        private readonly List<Ped> _ambientProtagonists = new List<Ped>();
        private float _nextAmbientRefresh;

        private void Start()
        {
            _currentIndex = 0;
            StartCoroutine(ApplyCurrentCharacterWhenReady());
        }

        private void Update()
        {
            if (Input.GetKeyDown(this.switchKey) && GameManager.CanPlayerReadInput())
                SwitchToNextCharacter();

            // Keep the other two protagonists alive in the world (V-style presence)
            if (Time.time > _nextAmbientRefresh)
            {
                _nextAmbientRefresh = Time.time + 30f;
                RefreshAmbientProtagonists();
            }
        }

        public void SwitchToNextCharacter() => SwitchTo((_currentIndex + 1) % this.Protagonists.Count);

        public void SwitchTo(int index)
        {
            if (null == Ped.Instance)
                return; // not loaded yet

            index = Mathf.Clamp(index, 0, this.Protagonists.Count - 1);
            _currentIndex = index;
            StartCoroutine(ApplyCurrentCharacterWhenReady());
        }

        private System.Collections.IEnumerator ApplyCurrentCharacterWhenReady()
        {
            var protagonist = this.Protagonists[_currentIndex];

            // Wait until a local ped exists & the world is loaded
            while (null == Ped.Instance)
                yield return new WaitForSeconds(0.5f);

            yield return new WaitForSeconds(0.2f);

            // Swap model through SAU's networked /skin command pipeline
            GtaVGameMode.SendCommand($"/skin {protagonist.PedModelId}");

            var state = GtaVGameMode.Instance.State;
            state.SetCharacter(protagonist.Name);

            // Signature car delivered in front of the new character, GTA V style
            if (null != Ped.Instance && null != Ped.Instance.transform)
            {
                var vehicle = SanAndreasUnity.Behaviours.Vehicles.Vehicle.CreateInFrontOf(
                    protagonist.SignatureVehicleId, Ped.Instance.transform);
                if (null != vehicle)
                    Debug.Log($"[GtaV] {protagonist.Name}'s vehicle delivered");
            }
        }

        private void RefreshAmbientProtagonists()
        {
            if (null == Ped.Instance)
                return;

            // Spawn the non-active protagonists as ambient peds near their hangouts
            for (int i = 0; i < this.Protagonists.Count; i++)
            {
                if (i == _currentIndex) continue;
                var p = this.Protagonists[i];
                bool alreadySpawned = _ambientProtagonists.Exists(
                    a => null != a && null != a.PedDef && a.PedDef.Id == p.PedModelId);
                if (alreadySpawned) continue;

                var pos = p.HangoutPosition + new Vector3(Random.Range(-2f, 2f), 0.1f, Random.Range(-2f, 2f));
                var ped = Ped_Spawning.SpawnPed(p.PedModelId, pos, Quaternion.identity, false);
                if (null != ped)
                    _ambientProtagonists.Add(ped);
            }
        }
    }
}
