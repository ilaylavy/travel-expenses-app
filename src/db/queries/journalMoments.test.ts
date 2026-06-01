import { createMoment, listMomentsForDay, addMember, removeMember, deleteMoment, splitMomentAfter, updateMomentTitle } from './journalMoments';

// These tests assume a Jest setup with a per-test sqlite DB and a helper
// that seeds a trip + a few journal entries. If the project doesn't have
// one, this test file documents the expected contract — convert it to an
// integration scenario you run manually in the dev app.

describe.skip('journalMoments — contract', () => {
  it('creates a Moment with members and lists it for the day', async () => {
    // arrange: seed trip + 2 photo entries on 2026-05-24
    // act:
    //   const moment = await createMoment({
    //     tripId, dayDate: '2026-05-24', title: 'Lunch', coverPhotoEntryId: null,
    //     createdBy: userId,
    //     memberIds: [{ kind: 'photo', id: entry1.id }, { kind: 'photo', id: entry2.id }],
    //   });
    //   const list = await listMomentsForDay(tripId, '2026-05-24');
    // assert:
    //   expect(list).toHaveLength(1);
    //   expect(list[0].title).toBe('Lunch');
    //   expect(list[0].id).toBe(moment.id);
    //   // also: both photo entries' moment_id is set to moment.id
  });

  it('addMember reassigns moment_id on the entry', async () => { /* ... */ });
  it('removeMember nulls moment_id; if last member, soft-deletes the Moment', async () => { /* ... */ });
  it('deleteMoment soft-deletes and nulls every member', async () => { /* ... */ });
  it('updateMomentTitle persists and bumps updated_at', async () => { /* ... */ });
  it('splitMomentAfter creates a sibling Moment with the later members', async () => { /* ... */ });
});
