import type { MenuItem } from "../validations/shop";

export type SampleLabels = { drinks: string; mains: string; snacks: string };

/** A small, typical Thai cafe menu so a new owner can see the till working straight away. */
export function sampleMenu(c: SampleLabels): MenuItem[] {
  return [
    { id: "sample-1", nameEN: "Iced tea", nameTH: "ชาเย็น", price: 35, category: c.drinks },
    { id: "sample-2", nameEN: "Iced coffee", nameTH: "กาแฟเย็น", price: 45, category: c.drinks },
    { id: "sample-3", nameEN: "Water", nameTH: "น้ำเปล่า", price: 15, category: c.drinks },
    { id: "sample-4", nameEN: "Fried rice", nameTH: "ข้าวผัด", price: 70, category: c.mains },
    { id: "sample-5", nameEN: "Pad Thai", nameTH: "ผัดไทย", price: 80, category: c.mains },
    { id: "sample-6", nameEN: "Green curry", nameTH: "แกงเขียวหวาน", price: 90, category: c.mains },
    { id: "sample-7", nameEN: "Spring rolls", nameTH: "ปอเปี๊ยะทอด", price: 60, category: c.snacks },
    { id: "sample-8", nameEN: "Mango sticky rice", nameTH: "ข้าวเหนียวมะม่วง", price: 100, category: c.snacks },
  ];
}
