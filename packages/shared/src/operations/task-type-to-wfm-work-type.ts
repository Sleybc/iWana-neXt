import { TaskType } from '../enums/tasks/task-type.enum';
import { WfmWorkType } from '../enums/wfm/wfm-work-type.enum';

export function mapTaskTypeToWfmWorkType(taskType: TaskType): WfmWorkType | null {
  switch (taskType) {
    case TaskType.INSTALLATION:
      return WfmWorkType.INSTALLATION;
    case TaskType.FIELD_VISIT:
      return WfmWorkType.TECHNICAL_VISIT;
    case TaskType.CUSTOMER_SUPPORT:
      return WfmWorkType.SUPPORT;
    case TaskType.INTERNAL_OPERATION:
      return WfmWorkType.MAINTENANCE;
    case TaskType.COLLECTION:
    case TaskType.BACKOFFICE:
    case TaskType.REVIEW:
      return null;
    default:
      return null;
  }
}
