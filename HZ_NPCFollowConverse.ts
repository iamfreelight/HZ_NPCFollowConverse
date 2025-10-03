/////////////////////////////////////////////////////////////////////////////////////////
// NPC AI Conversation & player-follower script for Meta Horizons - v0.1a
// by free.light - 10/2025 - iamfreelight@gmail.com
/////////////////////////////////////////////////////////////////////////////////////////

import { CodeBlockEvents, Component, Player, PropTypes, TriggerGizmo, Vec3 } from 'horizon/core';
import { Npc, NpcPlayer, NpcConversation, ConversationResponseTrigger } from 'horizon/npc';

class HZ_NPCFollowConverse extends Component<typeof HZ_NPCFollowConverse> {
    static propsDefinition = {
        trigger: { type: PropTypes.Entity },
        followDistance: { type: PropTypes.Number, default: 5 },  // distance to start moving toward player
        personalSpace: { type: PropTypes.Number, default: 2 },   // stop moving when within this distance
        wanderRadius: { type: PropTypes.Number, default: 5 },
        wanderInterval: { type: PropTypes.Number, default: 5000 },
        debugMode: { type: PropTypes.Boolean, default: false },
        clickThreshold: { type: PropTypes.Number, default: 400 }, // ms for double click
    };

    private npc!: Npc;
    private npcPlayer?: NpcPlayer;
    private npcConversation?: NpcConversation;

    private activePlayer: Player | null = null;
    private following = false;
    private homePos!: Vec3;

    private lastClickTime: number = 0;
    private clickTimer: number | null = null;

    async start() {
        if (!this.props.trigger) return console.error('No trigger set.');

        this.npc = this.entity.as(Npc);
        if (!this.npc.isConversationEnabled()) return console.error('Conversation not enabled.');

        this.npcPlayer = await this.npc.tryGetPlayer();
        if (!this.npcPlayer) return console.error('NPC does not have an NpcPlayer.');

        this.npcConversation = new NpcConversation(this.npc);
        this.homePos = this.npcPlayer.position.get();

        const trigger = this.props.trigger.as(TriggerGizmo);

        // Keep trigger at NPC position
        this.async.setInterval(() => {
            if (this.npcPlayer) {
                this.props.trigger?.position.set(this.npcPlayer.position.get());
                this.props.trigger?.rotation.set(this.npcPlayer.rotation.get());
            }
        }, 100);

        // Click trigger: handle single vs. double click
        this.connectCodeBlockEvent(trigger, CodeBlockEvents.OnPlayerEnterTrigger, async (player: Player) => {
            const now = Date.now();
            const isDoubleClick = now - this.lastClickTime <= this.props.clickThreshold!;
            this.lastClickTime = now;

            if (isDoubleClick) {
                // Toggle follow mode
                if (this.activePlayer?.id === player.id) {
                    this.following = !this.following;
                    if (!this.following) {
                        this.npcPlayer?.clearLookAtTarget();
                        this.npcPlayer?.removeAttentionTarget(player);
                    } else {
                        this.startFollowing(player);
                    }
                } else {
                    this.activePlayer = player;
                    this.following = true;
                    this.startFollowing(player);
                }

                // Cancel pending single-click
                if (this.clickTimer !== null) {
                    this.async.clearTimeout(this.clickTimer);
                    this.clickTimer = null;
                }

            } else {
                // Single click: listen and respond after threshold
                this.clickTimer = this.async.setTimeout(async () => {
                    if (!this.following || this.activePlayer?.id !== player.id) {
                        this.activePlayer = player;
                        await this.listenAndRespond(player);
                    }
                }, this.props.clickThreshold);
            }
        });

        // Wandering when idle
        this.async.setInterval(() => {
            if (!this.following && !this.activePlayer) this.wander();
        }, this.props.wanderInterval!);
    }

   private startFollowing(player: Player) {
      if (!this.npcPlayer) return;

      this.npcPlayer.addAttentionTarget(player);

      const followInterval = this.async.setInterval(() => {
        if (!this.npcPlayer || !this.following || !this.activePlayer) {
            this.async.clearInterval(followInterval);
            return;
        }

        const playerPos = this.activePlayer.position.get();
        const npcPos = this.npcPlayer.position.get();

        // Horizontal difference
        const dx = playerPos.x - npcPos.x;
        const dz = playerPos.z - npcPos.z;

        const distance = Math.sqrt(dx*dx + dz*dz);

        if (distance > this.props.personalSpace!) {
            const dirX = dx / distance;
            const dirZ = dz / distance;

            // Target at personal space distance
            const targetPos = new Vec3(
                playerPos.x - dirX * this.props.personalSpace!,
                npcPos.y,
                playerPos.z - dirZ * this.props.personalSpace!
            );

            try { this.npcPlayer.moveToPosition(targetPos); } catch {}
        }

        // Always face and look at player
        if (distance > 0) {
            const lookDir = new Vec3(dx, 0, dz);
            try { this.npcPlayer.rotateTo(lookDir); } catch {}
            try { this.npcPlayer.setLookAtTarget(playerPos); } catch {}
        }
      }, 200);
    }

    private async listenAndRespond(player: Player) {
      if (!this.npcPlayer || !this.npcConversation) return;

      this.npcPlayer.addAttentionTarget(player);
      await this.npcConversation.registerParticipant(player);
      await this.npcConversation.startListeningTo(player, ConversationResponseTrigger.Automatic);
    }

    private wander() {
      if (!this.npcPlayer) return;

      const angle = Math.random() * 2 * Math.PI;
      const radius = Math.random() * this.props.wanderRadius!;
      const targetPos = new Vec3(
        this.homePos.x + Math.cos(angle) * radius,
        this.homePos.y,
        this.homePos.z + Math.sin(angle) * radius
      );

      try { this.npcPlayer.moveToPosition(targetPos); } catch {};
      if (this.props.debugMode) console.log(`[DEBUG] NPC wandering to ${targetPos.x.toFixed(2)}, ${targetPos.z.toFixed(2)}`);
    }
}


Component.register(HZ_NPCFollowConverse);
