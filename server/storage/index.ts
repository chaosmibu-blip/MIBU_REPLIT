import { userStorage } from './userStorage';
import { placeStorage } from './placeStorage';
import { merchantStorage } from './merchantStorage';
import { gachaStorage } from './gachaStorage';
import { locationStorage } from './locationStorage';

export const storage = {
  ...userStorage,
  ...placeStorage,
  ...merchantStorage,
  ...gachaStorage,
  ...locationStorage,
};

export {
  userStorage,
  placeStorage,
  merchantStorage,
  gachaStorage,
  locationStorage,
};
