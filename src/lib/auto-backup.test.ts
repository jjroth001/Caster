import { backupsToRemove, folderName, isBackupDue } from './auto-backup';

jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {} }));

const DAY = 24 * 60 * 60 * 1000;

describe('isBackupDue', () => {
  const now = 100 * DAY;
  it('is never due when off', () => {
    expect(isBackupDue('off', null, now)).toBe(false);
  });
  it('is due straight away the first time', () => {
    expect(isBackupDue('daily', null, now)).toBe(true);
  });
  it('waits a day or a week, give or take a couple of hours', () => {
    expect(isBackupDue('daily', now - 23 * 60 * 60 * 1000, now)).toBe(true);
    expect(isBackupDue('daily', now - 12 * 60 * 60 * 1000, now)).toBe(false);
    expect(isBackupDue('weekly', now - 3 * DAY, now)).toBe(false);
    expect(isBackupDue('weekly', now - 7 * DAY, now)).toBe(true);
  });
});

describe('backupsToRemove', () => {
  it('keeps the newest automatic backups and ignores other files', () => {
    const names = [
      'caster-backup-2031-03-01.json',
      'caster-backup-2031-03-04.json',
      'caster-backup-2031-03-02.json',
      'caster-backup-2031-03-03.json',
      'holiday-photo.jpg',
    ];
    expect(backupsToRemove(names, 2)).toEqual([
      'caster-backup-2031-03-02.json',
      'caster-backup-2031-03-01.json',
    ]);
  });
});

describe('folderName', () => {
  it('shows the path of a picked folder', () => {
    expect(
      folderName(
        'content://com.android.externalstorage.documents/tree/primary%3ANextcloud%2FCaster',
      ),
    ).toBe('Nextcloud/Caster');
  });
});
