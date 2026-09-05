import type { RepairStatus } from './types'

export interface DemoRow {
  equipment: string
  status: RepairStatus
  ago: number
  serialNo?: string
  fromWhom?: string
  contact?: string
  location?: string
  problem?: string
  notes?: string
}

/** Демонстрационный набор — одинаковый в браузере и в настольной сборке. */
export const DEMO_ROWS: DemoRow[] = [
  { equipment: 'Ноутбук Dell Latitude 5540', serialNo: 'CN0X7T92', fromWhom: 'Иванов А. В.', contact: '+7 912 445-11-08', location: 'Цех №2, участок сборки', problem: 'Не включается после залития жидкостью', notes: 'Снята клавиатура, чистка платы ультразвуком', status: 'in_progress', ago: 3 },
  { equipment: 'Принтер HP LaserJet M428', serialNo: 'VNC4K0217B', fromWhom: 'Бухгалтерия', contact: 'доб. 214', location: 'Офис, 3 этаж', problem: 'Зажёвывает бумагу, скрип при подаче', notes: 'Заказан ролик подачи RM2-5741, срок 5 дней', status: 'waiting_parts', ago: 6 },
  { equipment: 'Сварочный инвертор Ресанта САИ-250', serialNo: 'R250-0099412', fromWhom: 'Петров С. И.', contact: '+7 908 220-73-41', location: 'Склад ГСМ', problem: 'Срабатывает защита под нагрузкой', notes: 'Пробит силовой ключ, нужен аналог IGBT', status: 'waiting_parts', ago: 21 },
  { equipment: 'Монитор LG 27UP650', serialNo: '104NTLK9C721', fromWhom: 'Сидоров К. П.', contact: '+7 900 133-90-22', location: 'Цех №1, диспетчерская', problem: 'Мерцание, самопроизвольное отключение', notes: 'Заменены вздутые конденсаторы в блоке питания', status: 'done', ago: 9 },
  { equipment: 'Шуруповёрт Makita DDF484', serialNo: 'MK-2291045', fromWhom: 'Бригада №4', location: 'Монтажный участок', problem: 'Не держит патрон, люфт вала', status: 'diagnostics', ago: 1 },
  { equipment: 'Компрессор Fubag B4000B', serialNo: 'FB40-77120', fromWhom: 'Кузнецов Д. А.', contact: '+7 917 604-55-19', location: 'Покрасочная камера', problem: 'Не набирает давление выше 4 бар', status: 'accepted', ago: 0 },
  { equipment: 'ИБП APC Smart-UPS 1500', serialNo: 'AS1834112956', fromWhom: 'Серверная', contact: 'доб. 101', location: 'Серверная, стойка 2', problem: 'Пищит, не переходит на батарею', notes: 'Батареи выработали ресурс, требуется комплект RBC7', status: 'waiting_parts', ago: 12 },
  { equipment: 'Станок ЧПУ фрезерный, шпиндель', serialNo: 'SP-2.2KW-0431', fromWhom: 'Участок ЧПУ', contact: 'Гончаров, доб. 340', location: 'Цех №3', problem: 'Биение шпинделя, посторонний шум', notes: 'Заменены подшипники, идёт обкатка', status: 'in_progress', ago: 5 },
  { equipment: 'Тепловизор Fluke Ti32', serialNo: 'TI32-99120', fromWhom: 'Отдел энергетики', contact: '+7 903 811-24-60', location: 'Энергоучасток', problem: 'Не фокусируется, ошибка объектива', status: 'rejected', ago: 30, notes: 'Ремонт нецелесообразен, стоимость выше 70% нового' },
  { equipment: 'Пылесос промышленный Karcher NT 30', serialNo: 'KA30-118842', fromWhom: 'Хозяйственный отдел', location: 'Склад инвентаря', problem: 'Слабая тяга, перегрев мотора', status: 'issued', ago: 18 },
  { equipment: 'Ноутбук Lenovo ThinkPad T14', serialNo: 'PF3K21LM', fromWhom: 'Морозова Е. С.', contact: '+7 962 447-01-73', location: 'Отдел кадров', problem: 'Не заряжается, греется разъём', notes: 'Заменён разъём питания, тест 8 часов пройден', status: 'done', ago: 4 },
  { equipment: 'Сканер штрих-кода Zebra DS2208', serialNo: 'ZB2208-4471', fromWhom: 'Склад готовой продукции', contact: 'доб. 178', location: 'Склад, зона отгрузки', problem: 'Не читает коды, тусклый луч', status: 'accepted', ago: 2 },
  { equipment: 'Углошлифовальная машина Bosch GWS 22', serialNo: 'BS22-660183', fromWhom: 'Бригада №2', location: 'Заготовительный участок', problem: 'Искрение щёток, падает обороты', notes: 'Заменены щётки и подшипник ротора', status: 'issued', ago: 25 },
  { equipment: 'Сервер Supermicro, блок питания', serialNo: 'SM-PWS-920P', fromWhom: 'ИТ-отдел', contact: 'доб. 101', location: 'Серверная, стойка 1', problem: 'Второй БП не выходит в резерв', status: 'diagnostics', ago: 7 },
]

/** Путь, который заявка прошла до текущего статуса — из него строится история. */
export function statusChain(status: RepairStatus): RepairStatus[] {
  if (status === 'accepted') return ['accepted']
  if (status === 'rejected') return ['accepted', 'diagnostics', 'rejected']
  const order: RepairStatus[] = ['diagnostics', 'waiting_parts', 'in_progress', 'done', 'issued']
  return ['accepted', ...order.slice(0, order.indexOf(status) + 1)]
}

export function daysAgo(n: number, hour = 10): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, 15, 0, 0)
  return d.toISOString()
}
