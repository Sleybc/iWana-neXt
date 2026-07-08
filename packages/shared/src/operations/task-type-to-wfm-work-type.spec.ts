import { TaskType } from '../enums/tasks/task-type.enum';
import { WfmWorkType } from '../enums/wfm/wfm-work-type.enum';
import { mapTaskTypeToWfmWorkType } from './task-type-to-wfm-work-type';

describe('mapTaskTypeToWfmWorkType', () => {
  it('maps INSTALLATION to INSTALLATION', () => {
    expect(mapTaskTypeToWfmWorkType(TaskType.INSTALLATION)).toBe(WfmWorkType.INSTALLATION);
  });

  it('maps BACKOFFICE to null', () => {
    expect(mapTaskTypeToWfmWorkType(TaskType.BACKOFFICE)).toBeNull();
  });

  it('maps FIELD_VISIT to TECHNICAL_VISIT', () => {
    expect(mapTaskTypeToWfmWorkType(TaskType.FIELD_VISIT)).toBe(WfmWorkType.TECHNICAL_VISIT);
  });

  it('maps CUSTOMER_SUPPORT to SUPPORT', () => {
    expect(mapTaskTypeToWfmWorkType(TaskType.CUSTOMER_SUPPORT)).toBe(WfmWorkType.SUPPORT);
  });
});
