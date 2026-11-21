<?php

use App\Enums\ConversationType;
use App\Enums\TeamRole;
use App\Models\Team;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('a direct chat link loads the newest messages in chronological order', function () {
    $viewer = User::factory()->create();
    $sender = User::factory()->create();
    $team = Team::factory()->create();
    $team->members()->attach($viewer, ['role' => TeamRole::Member->value]);
    $team->members()->attach($sender, ['role' => TeamRole::Member->value]);
    $conversation = $team->conversations()->create([
        'created_by' => $sender->id,
        'type' => ConversationType::Direct,
    ]);
    $conversation->participants()->attach($viewer, ['role' => 'member']);
    $conversation->participants()->attach($sender, ['role' => 'owner']);

    $messageIds = [];

    for ($number = 1; $number <= 82; $number++) {
        $messageIds[] = $conversation->messages()->create([
            'sender_id' => $sender->id,
            'type' => 'text',
            'body' => "Message {$number}",
        ])->id;
    }

    $this->actingAs($viewer)
        ->get(route('messenger', ['current_team' => $team->slug, 'conversation' => $conversation->id]))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('messenger')
            ->where('initialConversationId', $conversation->id)
            ->has('initialMessages', 80)
            ->where('initialHasOlderMessages', true)
            ->where('initialMessages.0.id', $messageIds[2])
            ->where('initialMessages.79.id', $messageIds[81])
            ->where('conversations.0.unread_count', 82)
            ->where('conversations.0.last_read_at', null));
});

test('the messenger page sends only recent chat partners, not every school member', function () {
    $viewer = User::factory()->create();
    $partner = User::factory()->create();
    $team = Team::factory()->create();
    $team->members()->attach($viewer, ['role' => TeamRole::Member->value]);
    $team->members()->attach($partner, ['role' => TeamRole::Member->value]);
    User::factory()->count(30)->create()
        ->each(fn (User $member) => $team->members()->attach($member, ['role' => TeamRole::Member->value]));

    $conversation = $team->conversations()->create([
        'created_by' => $viewer->id,
        'type' => ConversationType::Direct,
        'last_message_at' => now(),
    ]);
    $conversation->participants()->attach($viewer, ['role' => 'owner']);
    $conversation->participants()->attach($partner, ['role' => 'member']);

    $this->actingAs($viewer)
        ->get(route('messenger', ['current_team' => $team->slug]))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('messenger')
            ->has('contacts', 1)
            ->where('contacts.0.id', $partner->id)
            ->where('suggestedContactIds', [$partner->id]));
});

test('contact search keeps the search term on the next page link', function () {
    $viewer = User::factory()->create();
    $team = Team::factory()->create();
    $team->members()->attach($viewer, ['role' => TeamRole::Member->value]);
    User::factory()->count(101)->sequence(fn ($sequence) => ['name' => "Zed Student {$sequence->index}"])->create()
        ->each(fn (User $member) => $team->members()->attach($member, ['role' => TeamRole::Member->value]));

    $response = $this->actingAs($viewer)
        ->getJson("/api/teams/{$team->slug}/contacts?search=Zed")
        ->assertOk()
        ->assertJsonCount(100, 'data');

    expect($response->json('next_page_url'))->toContain('search=Zed');
});

test('contact search treats percent and underscore literally', function () {
    $viewer = User::factory()->create();
    $team = Team::factory()->create();
    $team->members()->attach($viewer, ['role' => TeamRole::Member->value]);
    User::factory()->count(3)->create()
        ->each(fn (User $member) => $team->members()->attach($member, ['role' => TeamRole::Member->value]));

    $this->actingAs($viewer)
        ->getJson("/api/teams/{$team->slug}/contacts?search=%25")
        ->assertOk()
        ->assertJsonCount(0, 'data');
});
